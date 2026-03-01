/* ============================================================
   ATLAS Data Engine
   Fetches and normalizes FEMA disasters + NWS alerts
   ============================================================ */

window.ATLAS = window.ATLAS || {};

ATLAS.data = (function () {

  const state = {
    disasters: [],
    alerts: [],
    fires: [],
    earthquakes: [],
    loading: false,
    lastFetch: null,
    errors: []
  };

  // --- FEMA Active Disasters ---
  async function fetchDisasters() {
    try {
      // Get disasters from the last 365 days that are active
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - 365);
      const cutoffStr = cutoff.toISOString().split('T')[0];

      // Use server proxy to avoid CORS
      const url = '/api/fema';

      const res = await fetch(url);
      if (!res.ok) throw new Error(`FEMA API: ${res.status}`);

      const data = await res.json();
      const records = data.DisasterDeclarationsSummaries || data.DisasterDeclarations || [];

      // Normalize
      state.disasters = records.map(d => ({
        id: d.disasterNumber,
        title: d.declarationTitle,
        type: d.incidentType,
        state: d.state,
        stateCode: d.stateCode || d.state,
        county: d.designatedArea,
        declarationDate: d.declarationDate,
        incidentBegin: d.incidentBeginDate,
        incidentEnd: d.incidentEndDate,
        declarationType: d.declarationType,
        programsActive: [
          d.ihProgramDeclared ? 'IH' : null,
          d.iaProgramDeclared ? 'IA' : null,
          d.paProgramDeclared ? 'PA' : null,
          d.hmProgramDeclared ? 'HM' : null
        ].filter(Boolean)
      }));

      console.log(`[ATLAS] Loaded ${state.disasters.length} FEMA disasters`);
      return state.disasters;

    } catch (err) {
      console.error('[ATLAS] FEMA fetch error:', err);
      state.errors.push({ source: 'FEMA', error: err.message });
      return [];
    }
  }

  // --- NWS Active Alerts ---
  async function fetchAlerts() {
    try {
      const url = 'https://api.weather.gov/alerts/active?status=actual&message_type=alert';

      const res = await fetch(url, {
        headers: { 'User-Agent': 'ATLAS/1.0 (disaster-intelligence)' }
      });
      if (!res.ok) throw new Error(`NWS API: ${res.status}`);

      const data = await res.json();
      const features = data.features || [];

      // Normalize and filter to significant alerts
      const severityOrder = { Extreme: 4, Severe: 3, Moderate: 2, Minor: 1, Unknown: 0 };
      state.alerts = features
        .filter(f => severityOrder[f.properties.severity] >= 2) // Moderate+
        .map(f => {
          const p = f.properties;
          // Extract centroid from geometry if available
          let lat = null, lon = null;
          if (f.geometry && f.geometry.type === 'Polygon') {
            const coords = f.geometry.coordinates[0];
            lat = coords.reduce((s, c) => s + c[1], 0) / coords.length;
            lon = coords.reduce((s, c) => s + c[0], 0) / coords.length;
          }

          return {
            id: p.id,
            event: p.event,
            headline: p.headline,
            severity: p.severity,
            certainty: p.certainty,
            urgency: p.urgency,
            areas: p.areaDesc,
            states: extractStates(p.areaDesc),
            onset: p.onset,
            expires: p.expires,
            senderName: p.senderName,
            lat: lat,
            lon: lon,
            geometry: f.geometry
          };
        })
        .sort((a, b) => (severityOrder[b.severity] || 0) - (severityOrder[a.severity] || 0));

      console.log(`[ATLAS] Loaded ${state.alerts.length} NWS alerts (Moderate+)`);
      return state.alerts;

    } catch (err) {
      console.error('[ATLAS] NWS fetch error:', err);
      state.errors.push({ source: 'NWS', error: err.message });
      return [];
    }
  }

  // --- NIFC Active Wildfires ---
  async function fetchFires() {
    try {
      const url = 'https://services3.arcgis.com/T4QMspbfLg3qTGWY/arcgis/rest/services/WFIGS_Incident_Locations_Current/FeatureServer/0/query' +
        '?where=IncidentTypeCategory%3D%27WF%27%20AND%20ActiveFireCandidate%3D1' +
        '&outFields=IncidentName,POOState,POOCounty,POOCity,IncidentSize,PercentContained,' +
        'FireDiscoveryDateTime,FireCause,IncidentComplexityLevel,TotalIncidentPersonnel,' +
        'EstimatedCostToDate,FireBehaviorGeneral,GACC,IrwinID,ModifiedOnDateTime_dt' +
        '&orderByFields=IncidentSize+DESC' +
        '&resultRecordCount=200' +
        '&returnGeometry=true' +
        '&f=json';

      const res = await fetch(url);
      if (!res.ok) throw new Error('NIFC API: ' + res.status);

      const data = await res.json();
      const features = data.features || [];

      state.fires = features.map(function (f) {
        var a = f.attributes;
        var stateCode = (a.POOState || '').replace('US-', '');
        return {
          id: a.IrwinID,
          name: a.IncidentName,
          state: stateCode,
          county: a.POOCounty,
          city: a.POOCity,
          acres: a.IncidentSize || 0,
          percentContained: a.PercentContained,
          discoveredDate: a.FireDiscoveryDateTime ? new Date(a.FireDiscoveryDateTime).toISOString() : null,
          cause: a.FireCause,
          complexity: a.IncidentComplexityLevel,
          personnel: a.TotalIncidentPersonnel,
          costToDate: a.EstimatedCostToDate,
          fireBehavior: a.FireBehaviorGeneral,
          gacc: a.GACC,
          lastUpdated: a.ModifiedOnDateTime_dt ? new Date(a.ModifiedOnDateTime_dt).toISOString() : null,
          lat: f.geometry ? f.geometry.y : null,
          lon: f.geometry ? f.geometry.x : null
        };
      });

      console.log('[ATLAS] Loaded ' + state.fires.length + ' active wildfires');
      return state.fires;

    } catch (err) {
      console.error('[ATLAS] NIFC fetch error:', err);
      state.errors.push({ source: 'NIFC', error: err.message });
      return [];
    }
  }

  // --- USGS Earthquakes ---
  async function fetchEarthquakes() {
    try {
      const url = 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_month.geojson';
      const res = await fetch(url);
      if (!res.ok) throw new Error('USGS API: ' + res.status);

      const data = await res.json();
      const features = data.features || [];

      state.earthquakes = features.map(function (f) {
        var p = f.properties;
        var coords = f.geometry.coordinates; // [lon, lat, depth]
        return {
          id: f.id,
          magnitude: p.mag,
          place: p.place,
          time: new Date(p.time).toISOString(),
          url: p.url,
          tsunami: p.tsunami,
          alert: p.alert, // PAGER: green/yellow/orange/red
          felt: p.felt,
          significance: p.sig,
          type: p.type,
          lat: coords[1],
          lon: coords[0],
          depth: coords[2]
        };
      }).sort(function (a, b) { return b.magnitude - a.magnitude; });

      console.log('[ATLAS] Loaded ' + state.earthquakes.length + ' earthquakes (M4.5+ last 30d)');
      return state.earthquakes;

    } catch (err) {
      console.error('[ATLAS] USGS fetch error:', err);
      state.errors.push({ source: 'USGS', error: err.message });
      return [];
    }
  }

  // Extract state abbreviations from area description
  function extractStates(areaDesc) {
    if (!areaDesc) return [];
    const stateAbbrevs = areaDesc.match(/\b[A-Z]{2}\b/g) || [];
    return [...new Set(stateAbbrevs)];
  }

  // --- Load All Data ---
  async function loadAll() {
    state.loading = true;
    state.errors = [];

    try {
      await Promise.all([
        fetchDisasters(),
        fetchAlerts(),
        fetchFires(),
        fetchEarthquakes()
      ]);

      state.lastFetch = new Date();
      state.loading = false;

      console.log(`[ATLAS] All data loaded at ${state.lastFetch.toLocaleTimeString()}`);
      return state;

    } catch (err) {
      state.loading = false;
      throw err;
    }
  }

  // --- Summary Stats ---
  function getSummary() {
    const disastersByState = {};
    state.disasters.forEach(d => {
      if (!disastersByState[d.state]) disastersByState[d.state] = [];
      disastersByState[d.state].push(d);
    });

    const disasterTypes = {};
    state.disasters.forEach(d => {
      disasterTypes[d.type] = (disasterTypes[d.type] || 0) + 1;
    });

    const alertsBySeverity = {};
    state.alerts.forEach(a => {
      alertsBySeverity[a.severity] = (alertsBySeverity[a.severity] || 0) + 1;
    });

    const totalFireAcres = state.fires.reduce((s, f) => s + (f.acres || 0), 0);

    return {
      totalDisasters: state.disasters.length,
      statesAffected: Object.keys(disastersByState).length,
      totalAlerts: state.alerts.length,
      totalFires: state.fires.length,
      totalFireAcres: totalFireAcres,
      totalEarthquakes: state.earthquakes.length,
      disastersByState,
      disasterTypes,
      alertsBySeverity,
      lastFetch: state.lastFetch
    };
  }

  // --- Context for AI ---
  function getAIContext(region) {
    let disasters = state.disasters;
    let alerts = state.alerts;
    let fires = state.fires;

    // Filter by region if specified
    if (region) {
      const regionStates = getRegionStates(region);
      if (regionStates.length > 0) {
        disasters = disasters.filter(d => regionStates.includes(d.state));
        alerts = alerts.filter(a => a.states.some(s => regionStates.includes(s)));
        fires = fires.filter(f => regionStates.includes(f.state));
      }
    }

    // Deduplicate disasters by disaster number (group counties)
    const uniqueDisasters = {};
    disasters.forEach(d => {
      if (!uniqueDisasters[d.id]) {
        uniqueDisasters[d.id] = { ...d, counties: [d.county] };
      } else {
        uniqueDisasters[d.id].counties.push(d.county);
      }
    });

    return {
      disasters: Object.values(uniqueDisasters).slice(0, 40),
      alerts: alerts.slice(0, 40),
      fires: fires.slice(0, 50),
      earthquakes: state.earthquakes.slice(0, 20),
      region: region || 'National',
      summary: getSummary()
    };
  }

  // Map region names to state codes
  function getRegionStates(region) {
    const regions = {
      'Gulf Coast': ['TX', 'LA', 'MS', 'AL', 'FL'],
      'Tornado Alley': ['TX', 'OK', 'KS', 'NE', 'SD', 'IA', 'MO', 'AR'],
      'West Coast': ['CA', 'OR', 'WA'],
      'Southeast': ['FL', 'GA', 'SC', 'NC', 'VA', 'AL', 'MS', 'TN'],
      'Northeast': ['ME', 'NH', 'VT', 'MA', 'RI', 'CT', 'NY', 'NJ', 'PA'],
      'Midwest': ['OH', 'MI', 'IN', 'IL', 'WI', 'MN', 'IA', 'MO'],
      'Mountain West': ['MT', 'WY', 'CO', 'NM', 'AZ', 'UT', 'ID', 'NV'],
      'Pacific': ['HI', 'AK', 'GU', 'AS', 'MP']
    };
    return regions[region] || [];
  }

  // Public API
  return {
    state,
    loadAll,
    getSummary,
    getAIContext,
    getRegionStates,
    fetchDisasters,
    fetchAlerts,
    fetchFires,
    fetchEarthquakes
  };

})();

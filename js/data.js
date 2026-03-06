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
    breakingNews: [],
    spcOutlook: [],
    spcIntensity: [],
    spcCIG: [],
    nhcOutlook: [],
    eroOutlook: [],
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
        fips: (d.fipsStateCode || '').padStart(2, '0') + (d.fipsCountyCode || '').padStart(3, '0'),
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
        '?where=IncidentTypeCategory%3D%27WF%27%20AND%20ActiveFireCandidate%3D1%20AND%20IncidentSize%3E%3D10' +
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

      // 7-day cutoff — older earthquakes aren't operationally relevant
      var sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);

      state.earthquakes = features.map(function (f) {
        var p = f.properties;
        var coords = f.geometry.coordinates; // [lon, lat, depth]
        return {
          id: f.id,
          magnitude: p.mag,
          place: p.place,
          time: new Date(p.time).toISOString(),
          timeMs: p.time,
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
      }).filter(function (q) {
        // Only show earthquakes from the last 7 days
        if (q.timeMs < sevenDaysAgo) return false;
        // US only: CONUS + HI + Caribbean territories (M4.5+), Alaska requires M5.0+
        // Pacific territories (Guam, CNMI, American Samoa) have positive longitudes
        var isAlaska = q.lat >= 51 && q.lat <= 72 && q.lon >= -180 && q.lon <= -129;
        var isUSMain = q.lat >= 17 && q.lat <= 72 && q.lon >= -180 && q.lon <= -64;
        var isGuamCNMI = q.lat >= 10 && q.lat <= 21 && q.lon >= 140 && q.lon <= 150;
        var isAmSamoa = q.lat >= -16 && q.lat <= -11 && q.lon >= -172 && q.lon <= -168;
        if (!isUSMain && !isGuamCNMI && !isAmSamoa) return false;
        if (isAlaska && q.magnitude < 5.0) return false;
        return true;
      }).sort(function (a, b) { return b.magnitude - a.magnitude; });

      console.log('[ATLAS] Loaded ' + state.earthquakes.length + ' US earthquakes (CONUS M4.5+, AK M5.0+)');
      return state.earthquakes;

    } catch (err) {
      console.error('[ATLAS] USGS fetch error:', err);
      state.errors.push({ source: 'USGS', error: err.message });
      return [];
    }
  }

  // --- Breaking News / Mass Casualty Events ---
  async function fetchBreakingNews() {
    try {
      const res = await fetch('/api/news');
      if (!res.ok) return [];
      const data = await res.json();
      state.breakingNews = data.news || [];
      console.log('[ATLAS] Loaded ' + state.breakingNews.length + ' breaking news items');
      return state.breakingNews;
    } catch (err) {
      console.error('[ATLAS] News fetch error:', err);
      state.errors.push({ source: 'News', error: err.message });
      return [];
    }
  }

  // --- SPC Convective Outlook (live GeoJSON from spc.noaa.gov) ---
  async function fetchSPCOutlook() {
    try {
      var res = await fetch('https://www.spc.noaa.gov/products/outlook/day1otlk_cat.nolyr.geojson');
      if (!res.ok) return [];
      var data = await res.json();
      state.spcOutlook = (data.features || []).filter(function (f) {
        return f.properties && f.properties.DN > 0;
      }).map(function (f) {
        return {
          riskLevel: f.properties.LABEL || '',
          riskLabel: f.properties.LABEL2 || '',
          category: f.properties.DN,
          fill: f.properties.fill || '',
          stroke: f.properties.stroke || '',
          valid: f.properties.VALID || '',
          expire: f.properties.EXPIRE || '',
          issue: f.properties.ISSUE || '',
          forecaster: f.properties.FORECASTER || '',
          geometry: f.geometry,
          source: 'SPC Day 1 Convective Outlook'
        };
      });
      console.log('[ATLAS] Loaded ' + state.spcOutlook.length + ' SPC outlook areas (live GeoJSON)');
      return state.spcOutlook;
    } catch (err) {
      console.error('[ATLAS] SPC outlook fetch error:', err);
      return [];
    }
  }

  // --- SPC Hazard-Specific Probabilities (live GeoJSON from spc.noaa.gov) ---
  async function fetchSPCIntensity() {
    var feeds = [
      { type: 'tornado', url: 'https://www.spc.noaa.gov/products/outlook/day1otlk_torn.nolyr.geojson' },
      { type: 'wind', url: 'https://www.spc.noaa.gov/products/outlook/day1otlk_wind.nolyr.geojson' },
      { type: 'hail', url: 'https://www.spc.noaa.gov/products/outlook/day1otlk_hail.nolyr.geojson' }
    ];
    var results = [];
    await Promise.all(feeds.map(function (feed) {
      return fetch(feed.url).then(function (res) {
        if (!res.ok) return;
        return res.json().then(function (data) {
          (data.features || []).filter(function (f) {
            return f.properties && f.properties.DN > 0;
          }).forEach(function (f) {
            results.push({
              hazard: feed.type,
              type: 'probabilistic',
              label: f.properties.LABEL || '',
              label2: f.properties.LABEL2 || '',
              category: f.properties.DN,
              fill: f.properties.fill || '',
              stroke: f.properties.stroke || '',
              valid: f.properties.VALID || '',
              expire: f.properties.EXPIRE || '',
              issue: f.properties.ISSUE || '',
              forecaster: f.properties.FORECASTER || '',
              geometry: f.geometry,
              source: 'SPC Day 1 ' + feed.type.charAt(0).toUpperCase() + feed.type.slice(1)
            });
          });
        });
      }).catch(function (err) {
        console.warn('[ATLAS] SPC ' + feed.type + ' fetch error:', err);
      });
    }));
    state.spcIntensity = results;
    console.log('[ATLAS] Loaded ' + state.spcIntensity.length + ' SPC probability areas (live GeoJSON)');
    return state.spcIntensity;
  }

  // --- SPC Conditional Intensity Guidance (CIG) ---
  // Live GeoJSON feeds from SPC (launched March 3, 2026)
  // https://www.weather.gov/news/262402-spc
  async function fetchSPCCIG() {
    var hazards = [
      { type: 'tornado', url: 'https://www.spc.noaa.gov/products/outlook/day1otlk_cigtorn.nolyr.geojson' },
      { type: 'wind', url: 'https://www.spc.noaa.gov/products/outlook/day1otlk_cigwind.nolyr.geojson' },
      { type: 'hail', url: 'https://www.spc.noaa.gov/products/outlook/day1otlk_cighail.nolyr.geojson' }
    ];
    var results = [];
    await Promise.all(hazards.map(function (hazard) {
      return fetch(hazard.url).then(function (res) {
        if (!res.ok) return;
        return res.json().then(function (data) {
          (data.features || []).filter(function (f) { return f.properties && f.properties.DN > 0; }).forEach(function (f) {
            results.push({
              hazard: hazard.type,
              level: 'CIG' + f.properties.DN,
              label: f.properties.LABEL || '',
              label2: f.properties.LABEL2 || '',
              valid: f.properties.VALID || '',
              expire: f.properties.EXPIRE || '',
              issue: f.properties.ISSUE || '',
              forecaster: f.properties.FORECASTER || '',
              geometry: f.geometry,
              source: 'SPC Day 1 CIG ' + hazard.type.charAt(0).toUpperCase() + hazard.type.slice(1)
            });
          });
        });
      }).catch(function (err) {
        console.warn('[ATLAS] CIG ' + hazard.type + ' fetch error:', err);
      });
    }));
    state.spcCIG = results;
    console.log('[ATLAS] Loaded ' + results.length + ' CIG areas from live SPC GeoJSON');
    return state.spcCIG;
  }

  // --- NHC Tropical Outlook ---
  async function fetchNHCOutlook() {
    try {
      const url = 'https://mapservices.weather.noaa.gov/tropical/rest/services/tropical/NHC_tropical_weather/MapServer/0/query' +
        '?where=1%3D1&outFields=*&f=json&returnGeometry=false&resultRecordCount=10';
      const res = await fetch(url);
      if (!res.ok) return [];
      const data = await res.json();
      state.nhcOutlook = (data.features || []).map(function (f) {
        return {
          name: f.attributes.STORMNAME || f.attributes.NAME || 'Unnamed',
          type: f.attributes.STORMTYPE || f.attributes.TYPE || 'Unknown',
          windSpeed: f.attributes.MAXWIND || f.attributes.INTENSITY,
          movement: f.attributes.MOVEMENT || f.attributes.MVMT,
          source: 'NHC Tropical Outlook'
        };
      });
      console.log('[ATLAS] Loaded ' + state.nhcOutlook.length + ' NHC tropical features');
      return state.nhcOutlook;
    } catch (err) {
      console.error('[ATLAS] NHC fetch error:', err);
      return [];
    }
  }

  // --- WPC Excessive Rainfall Outlook ---
  async function fetchEROOutlook() {
    try {
      const url = 'https://mapservices.weather.noaa.gov/vector/rest/services/hazards/wpc_precip_hazards/MapServer/0/query' +
        '?where=1%3D1&outFields=LABEL,LABEL2,stroke,fill,dn,idp_source&f=json&returnGeometry=false';
      const res = await fetch(url);
      if (!res.ok) return [];
      const data = await res.json();
      state.eroOutlook = (data.features || []).map(function (f) {
        return {
          riskLevel: f.attributes.LABEL || f.attributes.LABEL2,
          category: f.attributes.dn,
          source: 'WPC Day 1 Excessive Rainfall Outlook'
        };
      });
      console.log('[ATLAS] Loaded ' + state.eroOutlook.length + ' ERO outlook areas');
      return state.eroOutlook;
    } catch (err) {
      console.error('[ATLAS] ERO fetch error:', err);
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
        fetchEarthquakes(),
        fetchBreakingNews(),
        fetchSPCOutlook(),
        fetchSPCIntensity(),
        fetchSPCCIG(),
        fetchNHCOutlook(),
        fetchEROOutlook()
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

    // Unique disaster incidents (vs per-county declarations)
    const uniqueDisasterIds = new Set(state.disasters.map(d => d.id));

    const alertsBySeverity = {};
    state.alerts.forEach(a => {
      alertsBySeverity[a.severity] = (alertsBySeverity[a.severity] || 0) + 1;
    });

    // Active fires = not 100% contained
    const activeFires = state.fires.filter(f => f.percentContained == null || f.percentContained < 100);
    const totalFireAcres = state.fires.reduce((s, f) => s + (f.acres || 0), 0);

    // US-area earthquakes (CONUS + AK + HI + territories)
    const usEarthquakes = state.earthquakes.filter(q =>
      q.lat >= 17 && q.lat <= 72 && q.lon >= -180 && q.lon <= -64
    );

    return {
      totalDisasters: state.disasters.length,
      uniqueDisasters: uniqueDisasterIds.size,
      statesAffected: Object.keys(disastersByState).length,
      totalAlerts: state.alerts.length,
      totalFires: state.fires.length,
      activeFires: activeFires.length,
      totalFireAcres: totalFireAcres,
      totalEarthquakes: state.earthquakes.length,
      usEarthquakes: usEarthquakes.length,
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
      breakingNews: state.breakingNews.slice(0, 10),
      spcOutlook: state.spcOutlook,
      spcIntensity: state.spcIntensity,
      spcCIG: state.spcCIG,
      nhcOutlook: state.nhcOutlook,
      eroOutlook: state.eroOutlook,
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
    fetchEarthquakes,
    fetchBreakingNews,
    fetchSPCOutlook,
    fetchSPCIntensity,
    fetchSPCCIG,
    fetchNHCOutlook,
    fetchEROOutlook
  };

})();

/* ============================================================
   ATLAS Data Engine
   Fetches and normalizes FEMA disasters + NWS alerts
   ============================================================ */

window.ATLAS = window.ATLAS || {};

ATLAS.data = (function () {

  const state = {
    disasters: [],
    alerts: [],
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

      const url = `https://www.fema.gov/api/open/v2/DisasterDeclarations?$filter=declarationDate ge '${cutoffStr}' and disasterCloseoutDate eq null&$orderby=declarationDate desc&$top=200`;

      const res = await fetch(url);
      if (!res.ok) throw new Error(`FEMA API: ${res.status}`);

      const data = await res.json();
      const records = data.DisasterDeclarations || [];

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
        fetchAlerts()
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

    return {
      totalDisasters: state.disasters.length,
      statesAffected: Object.keys(disastersByState).length,
      totalAlerts: state.alerts.length,
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

    // Filter by region if specified
    if (region) {
      const regionStates = getRegionStates(region);
      if (regionStates.length > 0) {
        disasters = disasters.filter(d => regionStates.includes(d.state));
        alerts = alerts.filter(a => a.states.some(s => regionStates.includes(s)));
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
    fetchAlerts
  };

})();

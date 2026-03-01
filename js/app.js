/* ============================================================
   ATLAS App Controller
   Modes, scenarios, UI wiring
   ============================================================ */

(function () {

  var currentMode = 'ask';

  // --- Initialize ---
  async function init() {
    console.log('[ATLAS] Initializing...');

    // Wait for Calcite
    await customElements.whenDefined('calcite-shell');

    // Init map
    await ATLAS.map.init();

    // Load data
    updateStatus('Loading data...', 'brand');
    await ATLAS.data.loadAll();

    // Add data to map
    ATLAS.map.addDisasters(ATLAS.data.state.disasters);
    ATLAS.map.addAlerts(ATLAS.data.state.alerts);

    // Update status chip
    var summary = ATLAS.data.getSummary();
    updateStatus(
      summary.totalDisasters + ' disasters \u00B7 ' + summary.totalAlerts + ' alerts',
      'brand'
    );

    // Wire up event listeners
    wireEvents();

    console.log('[ATLAS] Ready');
  }

  // --- Wire Events ---
  function wireEvents() {
    // Mode tabs — listen on both parent and individual items for reliability
    var modeTabs = document.getElementById('mode-tabs');
    modeTabs.addEventListener('calciteSegmentedControlChange', function () {
      var selected = modeTabs.querySelector('calcite-segmented-control-item[checked]');
      if (selected) switchMode(selected.value);
    });
    // Backup: click listeners on individual items
    modeTabs.querySelectorAll('calcite-segmented-control-item').forEach(function (item) {
      item.addEventListener('click', function () {
        setTimeout(function () { switchMode(item.value); }, 50);
      });
    });

    // Submit button
    document.getElementById('btn-submit').addEventListener('click', submitQuery);

    // Enter key on input
    document.getElementById('query-input').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') submitQuery();
    });

    // Ask mode scenario buttons
    document.getElementById('btn-national').addEventListener('click', function () {
      runScenario('Provide a comprehensive national threat assessment. Analyze all active FEMA disaster declarations and NWS weather alerts. Identify the top threats, rank states by risk level, and provide recommended actions for Red Cross leadership.', 'ask');
    });

    document.getElementById('btn-disasters').addEventListener('click', function () {
      runScenario('Analyze all active FEMA disaster declarations. Which disaster types are most prevalent? Which states are most affected? Identify emerging patterns and rank the most significant active disasters by impact and urgency.', 'ask');
    });

    document.getElementById('btn-weather').addEventListener('click', function () {
      runScenario('Analyze all active NWS severe weather alerts. What are the most dangerous weather threats right now? Which regions face the greatest risk? Provide a weather threat assessment with specific areas of concern.', 'ask');
    });

    // Assess mode scenario buttons
    document.getElementById('btn-hurricane').addEventListener('click', function () {
      runScenario('Conduct a hurricane impact assessment for the Gulf Coast region (TX, LA, MS, AL, FL). Analyze current disaster declarations and severe weather in these states. Identify the most vulnerable communities, estimate population at risk, and provide pre-positioning recommendations for Red Cross sheltering operations.', 'assess', 'Gulf Coast');
    });

    document.getElementById('btn-tornado').addEventListener('click', function () {
      runScenario('Conduct a severe weather impact assessment for Tornado Alley (TX, OK, KS, NE, SD, IA, MO, AR). Analyze current tornado watches, severe thunderstorm warnings, and active disaster declarations. Identify counties at highest risk and recommend shelter pre-positioning.', 'assess', 'Tornado Alley');
    });

    document.getElementById('btn-earthquake').addEventListener('click', function () {
      runScenario('Conduct an earthquake risk assessment for the West Coast (CA, OR, WA). Analyze any active disaster declarations, seismic alerts, and social vulnerability data. Identify the most vulnerable urban areas, estimate population exposure, and recommend mass care pre-positioning.', 'assess', 'West Coast');
    });
  }

  // --- Mode Switching ---
  function switchMode(mode) {
    currentMode = mode;

    // Toggle scenario bars
    document.getElementById('ask-scenarios').style.display = mode === 'ask' ? 'flex' : 'none';
    document.getElementById('assess-scenarios').style.display = mode === 'assess' ? 'flex' : 'none';

    // Update input placeholder
    var input = document.getElementById('query-input');
    switch (mode) {
      case 'ask':
        input.placeholder = 'Ask ATLAS a question...';
        break;
      case 'brief':
        input.placeholder = 'Customize briefing focus (optional)...';
        // Auto-generate briefing
        runBriefing();
        break;
      case 'assess':
        input.placeholder = 'Describe a scenario to assess...';
        break;
    }
  }

  // --- Submit Text Query ---
  function submitQuery() {
    var input = document.getElementById('query-input');
    var query = input.value.trim();
    if (!query) return;

    input.value = '';
    runQuery(query, currentMode);
  }

  // --- Run Query Pipeline ---
  async function runQuery(query, mode, region) {
    ATLAS.ai.showLoading(getLoadingMessage(mode));
    ATLAS.map.clearHighlights();

    // If region specified, zoom map there
    if (region) {
      ATLAS.map.zoomToRegion(region);
      ATLAS.map.showSVI(true);
    } else if (mode === 'ask') {
      ATLAS.map.zoomToNation();
    }

    try {
      var response = await ATLAS.ai.analyze(query, mode, region);
      ATLAS.ai.renderResponse(response);
    } catch (err) {
      console.error('[ATLAS] Query error:', err);
      ATLAS.ai.showError(err.message);
    }
  }

  // --- Run Scenario ---
  function runScenario(query, mode, region) {
    runQuery(query, mode, region);
  }

  // --- Run Briefing (Brief mode auto-generate) ---
  function runBriefing() {
    var query = 'Generate a comprehensive executive intelligence briefing covering: ' +
      '1) Current threat landscape summary, ' +
      '2) Active FEMA disaster declarations by type and region, ' +
      '3) Severe weather threats and watches, ' +
      '4) Emerging risk areas requiring attention, ' +
      '5) Recommended operational posture and resource pre-positioning. ' +
      'This is for senior Red Cross leadership. Be authoritative and specific.';

    runQuery(query, 'brief');
  }

  // --- Loading Messages ---
  function getLoadingMessage(mode) {
    switch (mode) {
      case 'brief': return 'Generating executive briefing...';
      case 'assess': return 'Running impact assessment...';
      default: return 'ATLAS is analyzing threat data...';
    }
  }

  // --- Update Status Chip ---
  function updateStatus(text, kind) {
    var chip = document.getElementById('data-status');
    chip.textContent = text;
    if (kind) chip.kind = kind;
  }

  // --- Boot ---
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();

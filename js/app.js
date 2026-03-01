/* ============================================================
   ATLAS App Controller
   Modes, scenarios, UI wiring, threat level, voice input
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
    ATLAS.map.addFires(ATLAS.data.state.fires);
    ATLAS.map.addEarthquakes(ATLAS.data.state.earthquakes);

    // Update status chip
    var summary = ATLAS.data.getSummary();
    var statusParts = [
      summary.totalDisasters + ' disasters',
      summary.totalAlerts + ' alerts',
      summary.totalFires + ' fires'
    ];
    if (summary.totalEarthquakes > 0) {
      statusParts.push(summary.totalEarthquakes + ' quakes');
    }
    updateStatus(statusParts.join(' \u00B7 '), 'brand');

    // Compute and display threat level
    updateThreatLevel(summary);

    // Wire up event listeners
    wireEvents();

    console.log('[ATLAS] Ready');
  }

  // --- Wire Events ---
  function wireEvents() {
    // Mode tabs
    var modeTabs = document.getElementById('mode-tabs');
    modeTabs.addEventListener('calciteSegmentedControlChange', function () {
      var selected = modeTabs.querySelector('calcite-segmented-control-item[checked]');
      if (selected) switchMode(selected.value);
    });
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

    // --- Ask mode scenario buttons ---
    document.getElementById('btn-national').addEventListener('click', function () {
      runScenario('Provide a comprehensive national threat assessment. Analyze all active FEMA disaster declarations, NWS weather alerts, active wildfires, and recent earthquakes. Identify the top threats across all categories, rank states by composite risk level, and provide recommended actions for Red Cross leadership.', 'ask');
    });

    document.getElementById('btn-disasters').addEventListener('click', function () {
      runScenario('Analyze all active FEMA disaster declarations. Which disaster types are most prevalent? Which states are most affected? Identify emerging patterns and rank the most significant active disasters by impact and urgency.', 'ask');
    });

    document.getElementById('btn-weather').addEventListener('click', function () {
      runScenario('Analyze all active NWS severe weather alerts. What are the most dangerous weather threats right now? Which regions face the greatest risk? Provide a weather threat assessment with specific areas of concern.', 'ask');
    });

    document.getElementById('btn-fires').addEventListener('click', function () {
      runScenario('Analyze all active wildfires. Which fires are the most dangerous based on size, containment percentage, and proximity to populated areas? Provide a state-by-state breakdown of fire activity. Rank the top fire threats and include personnel deployed, acreage, and containment status. Provide deployment recommendations for Red Cross sheltering operations.', 'ask');
    });

    // --- Brief mode ---
    document.getElementById('btn-briefing').addEventListener('click', function () {
      runBriefing();
    });

    // --- Assess mode scenario buttons ---
    document.getElementById('btn-hurricane').addEventListener('click', function () {
      runScenario('Conduct a hurricane impact assessment for the Gulf Coast region (TX, LA, MS, AL, FL). Analyze current disaster declarations and severe weather in these states. Identify the most vulnerable communities, estimate population at risk, and provide pre-positioning recommendations for Red Cross sheltering operations.', 'assess', 'Gulf Coast');
    });

    document.getElementById('btn-tornado').addEventListener('click', function () {
      runScenario('Conduct a severe weather impact assessment for Tornado Alley (TX, OK, KS, NE, SD, IA, MO, AR). Analyze current tornado watches, severe thunderstorm warnings, and active disaster declarations. Identify counties at highest risk and recommend shelter pre-positioning.', 'assess', 'Tornado Alley');
    });

    document.getElementById('btn-earthquake').addEventListener('click', function () {
      runScenario('Conduct an earthquake risk assessment for the West Coast (CA, OR, WA). Analyze recent seismic activity from the USGS earthquake data, any active disaster declarations, and social vulnerability data. Identify the most vulnerable urban areas, estimate population exposure, and recommend mass care pre-positioning.', 'assess', 'West Coast');
    });

    document.getElementById('btn-wildfire-assess').addEventListener('click', function () {
      runScenario('Conduct a wildfire impact assessment for the Western and Southern United States. Analyze all active wildfires with emphasis on fires >1,000 acres or <50% contained. Cross-reference fire locations with social vulnerability data. Identify communities at immediate risk, recommend evacuation shelter locations, and provide resource pre-positioning guidance. Include state-by-state breakdown with acreage and personnel.', 'assess');
    });

    // --- Layer toggle chips ---
    ['disasters', 'alerts', 'fires', 'quakes', 'radar', 'qpf', 'wwa', 'svi'].forEach(function (name) {
      var chip = document.getElementById('toggle-' + name);
      if (chip) {
        chip.addEventListener('click', function () {
          var visible = ATLAS.map.toggleLayer(name);
          chip.classList.toggle('active', visible);
        });
      }
    });

    // --- Voice input ---
    initVoice();
  }

  // --- Voice Input ---
  function initVoice() {
    var voiceBtn = document.getElementById('btn-voice');
    if (!voiceBtn) return;

    var SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      voiceBtn.style.display = 'none';
      return;
    }

    var recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    voiceBtn.addEventListener('click', function () {
      recognition.start();
      voiceBtn.classList.add('listening');
    });

    recognition.onresult = function (event) {
      var transcript = event.results[0][0].transcript;
      document.getElementById('query-input').value = transcript;
      if (event.results[0].isFinal) {
        stopListening();
        submitQuery();
      }
    };

    recognition.onend = stopListening;
    recognition.onerror = stopListening;

    function stopListening() {
      voiceBtn.classList.remove('listening');
    }
  }

  // --- Mode Switching ---
  function switchMode(mode) {
    currentMode = mode;

    // Toggle scenario bars
    document.getElementById('ask-scenarios').style.display = mode === 'ask' ? 'flex' : 'none';
    document.getElementById('brief-scenarios').style.display = mode === 'brief' ? 'flex' : 'none';
    document.getElementById('assess-scenarios').style.display = mode === 'assess' ? 'flex' : 'none';

    // Update input placeholder
    var input = document.getElementById('query-input');
    switch (mode) {
      case 'ask':
        input.placeholder = 'Ask ATLAS a question...';
        break;
      case 'brief':
        input.placeholder = 'Customize briefing focus or click Generate...';
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

  // --- Run Briefing ---
  function runBriefing() {
    var query = 'Generate a comprehensive executive intelligence briefing covering: ' +
      '1) Current threat landscape summary with overall threat level assessment, ' +
      '2) Active FEMA disaster declarations by type and region, ' +
      '3) Wildfire situation — top fires by size, containment, and personnel deployed, ' +
      '4) Severe weather threats and watches, ' +
      '5) Recent seismic activity if any, ' +
      '6) Emerging risk areas requiring attention, ' +
      '7) Recommended operational posture and resource pre-positioning. ' +
      'This is for senior Red Cross leadership. Be authoritative and specific.';

    runQuery(query, 'brief');
  }

  // --- Threat Level Computation ---
  function updateThreatLevel(summary) {
    var score = 0;

    // Fire severity — big uncontained fires
    var bigFires = ATLAS.data.state.fires.filter(function (f) {
      return f.acres >= 10000 && (f.percentContained == null || f.percentContained < 50);
    });
    score += Math.min(bigFires.length * 2, 6);

    // Alert severity
    if (summary.alertsBySeverity && summary.alertsBySeverity.Extreme) {
      score += Math.min(summary.alertsBySeverity.Extreme * 2, 6);
    }
    if (summary.alertsBySeverity && summary.alertsBySeverity.Severe) {
      score += Math.min(summary.alertsBySeverity.Severe, 4);
    }

    // Earthquake activity
    var sigQuakes = ATLAS.data.state.earthquakes.filter(function (q) { return q.magnitude >= 5.0; });
    score += Math.min(sigQuakes.length * 2, 4);

    // Active disasters
    if (summary.totalDisasters > 150) score += 2;
    else if (summary.totalDisasters > 100) score += 1;

    // Fire acreage
    if (summary.totalFireAcres > 100000) score += 3;
    else if (summary.totalFireAcres > 50000) score += 2;
    else if (summary.totalFireAcres > 10000) score += 1;

    var level, label;
    if (score >= 10) { level = 'critical'; label = 'CRITICAL'; }
    else if (score >= 6) { level = 'high'; label = 'HIGH'; }
    else if (score >= 3) { level = 'elevated'; label = 'ELEVATED'; }
    else { level = 'guarded'; label = 'GUARDED'; }

    var badge = document.getElementById('threat-level');
    if (badge) {
      badge.setAttribute('data-level', level);
      badge.querySelector('.threat-value').textContent = label;
      badge.style.display = 'flex';
    }
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

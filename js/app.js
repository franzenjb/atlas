/* ============================================================
   ATLAS App Controller
   Modes, scenarios, UI wiring, threat level, voice input
   ============================================================ */

(function () {

  var currentMode = 'ask';
  var cachedBriefingData = null;  // Stored cron briefing — buttons serve this instead of calling Claude

  // --- Initialize ---
  async function init() {
    console.log('[ATLAS] Initializing...');

    // Wait for Calcite
    await customElements.whenDefined('calcite-shell');

    // Init map
    await ATLAS.map.init();

    // Start cached briefing fetch in parallel (awaited later)
    var briefingPromise = loadCachedBriefing();

    // Load data
    updateStatus('Loading data...', 'brand');
    await ATLAS.data.loadAll();

    // Add data to map (addDisasters is async — queries county boundaries)
    await ATLAS.map.addDisasters(ATLAS.data.state.disasters);
    ATLAS.map.addAlerts(ATLAS.data.state.alerts);
    ATLAS.map.addFires(ATLAS.data.state.fires);
    ATLAS.map.addEarthquakes(ATLAS.data.state.earthquakes);
    ATLAS.map.renderSPC(ATLAS.data.state.spcOutlook, ATLAS.data.state.spcIntensity);
    ATLAS.map.renderCIG(ATLAS.data.state.spcCIG);

    // Build clickable status chips
    var summary = ATLAS.data.getSummary();
    buildStatusChips(summary);

    // Wait for briefing fetch to finish before checking
    await briefingPromise;

    // If briefing is active, hide ALL data layers — only rankings should show
    if (cachedBriefingData) {
      ['disasters', 'alerts', 'fires', 'quakes'].forEach(function(name) {
        if (ATLAS.map.isLayerVisible(name)) ATLAS.map.toggleLayer(name);
      });
      document.querySelectorAll('.status-chip').forEach(function(chip) {
        chip.classList.remove('active');
      });
      ['disasters', 'alerts', 'fires', 'quakes'].forEach(function(id) {
        var toggle = document.getElementById('toggle-' + id);
        if (toggle) toggle.classList.remove('active');
      });
    }

    // Compute and display threat level
    updateThreatLevel(summary);

    // Wire up event listeners
    wireEvents();

    console.log('[ATLAS] Ready');
  }

  // --- Load Cached Briefing ---
  async function loadCachedBriefing() {
    try {
      var res = await fetch('/api/briefing');
      if (!res.ok) {
        console.log('[ATLAS] No cached briefing available');
        return;
      }
      var data = await res.json();
      if (data && data.briefing) {
        console.log('[ATLAS] Cached briefing loaded from', data.generatedAt);
        cachedBriefingData = data;  // Store for button reuse
        ATLAS.ai.renderCachedBanner(data.generatedAt);
        // Don't execute mapCommands from cached briefings — keep CONUS view on load
        var briefing = data.briefing;
        briefing.mapCommands = [];
        ATLAS.ai.renderResponse(briefing);
      }
    } catch (err) {
      console.log('[ATLAS] Cached briefing fetch failed (graceful fallback):', err.message);
    }
  }

  // --- Wire Events ---
  function wireEvents() {
    // Mode tabs
    var modeTabs = document.getElementById('mode-tabs');
    modeTabs.querySelectorAll('button').forEach(function (btn) {
      btn.addEventListener('click', function () {
        modeTabs.querySelectorAll('button').forEach(function (b) { b.classList.remove('active'); });
        btn.classList.add('active');
        switchMode(btn.value);
      });
    });

    // Submit button
    document.getElementById('btn-submit').addEventListener('click', submitQuery);

    // Enter key on input
    document.getElementById('query-input').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') submitQuery();
    });

    // --- Ask mode scenario buttons — serve cached cron briefing (no Claude call) ---
    document.getElementById('btn-national').addEventListener('click', function () { showCachedBriefing(); });
    document.getElementById('btn-disasters').addEventListener('click', function () { showCachedBriefing('disasters'); });
    document.getElementById('btn-weather').addEventListener('click', function () { showCachedBriefing('wwa'); });
    document.getElementById('btn-fires').addEventListener('click', function () { showCachedBriefing('fires'); });
    document.getElementById('btn-breaking').addEventListener('click', function () { showCachedBriefing(); });
    document.getElementById('btn-outlook').addEventListener('click', function () { showCachedBriefing(); });

    // --- Brief mode ---
    document.getElementById('btn-briefing').addEventListener('click', function () {
      runBriefing();
    });

    // --- Layer toggle chips ---
    ['disasters', 'alerts', 'fires', 'quakes', 'radar', 'qpf', 'wwa', 'svi', 'spc', 'spc-prob', 'spc-cig', 'nhc', 'ero'].forEach(function (name) {
      var chip = document.getElementById('toggle-' + name);
      if (chip) {
        chip.addEventListener('click', function () {
          ATLAS.map.clearHighlights();
          var visible = ATLAS.map.toggleLayer(name);
          chip.classList.toggle('active', visible);
          // Zoom to appropriate extent when toggling data layers on
          if (visible && name === 'quakes') {
            ATLAS.map.zoomToQuakeExtent();
          } else if (visible && (name === 'disasters' || name === 'fires')) {
            ATLAS.map.zoomToNation();
          }
        });
      }
    });

    // --- Sidebar toggle (pin open / collapse) ---
    var sidebarToggle = document.getElementById('sidebarToggle');
    if (sidebarToggle) {
      sidebarToggle.addEventListener('click', function () {
        var sidebar = document.getElementById('sidebar');
        sidebar.classList.toggle('collapsed');
        sidebar.classList.toggle('pinned');
      });
    }

    // --- Sidebar nav actions ---
    document.querySelectorAll('#sidebar [data-action]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var action = btn.dataset.action;
        if (action === 'home') ATLAS.map.zoomToNation();
        else if (action === 'zoom-in') ATLAS.map.zoomIn();
        else if (action === 'zoom-out') ATLAS.map.zoomOut();
      });
    });

    // --- Fire containment filter ---
    var containedChip = document.getElementById('filter-contained');
    if (containedChip) {
      containedChip.addEventListener('click', function () {
        var hiding = ATLAS.map.setFireFilter(!containedChip.classList.contains('active'));
        containedChip.classList.toggle('active', hiding);
      });
    }

    // --- Export PDF ---
    document.getElementById('btn-export').addEventListener('click', function () {
      ATLAS.ai.exportPDF();
    });

    // --- Intel panel toggle ---
    var intelPanel = document.getElementById('intel-panel');
    var toggleIntelInline = document.getElementById('btn-toggle-intel');
    var toggleIntelFixed = document.getElementById('btn-toggle-intel-fixed');
    var intelToggleBtn = document.getElementById('intelToggleBtn');

    function toggleIntelPanel() {
      var isOpen = !intelPanel.collapsed;
      if (isOpen) {
        ATLAS.map.clearHighlights();
        intelPanel.collapsed = true;
        toggleIntelFixed.style.display = 'flex';
        ATLAS.map.setViewPadding({ right: 0, left: 56 });
      } else {
        intelPanel.collapsed = false;
        toggleIntelFixed.style.display = 'none';
        ATLAS.map.setViewPadding({ right: 420, left: 56 });
      }
      // Re-fit CONUS after panel resize completes
      setTimeout(function () { ATLAS.map.zoomToNation(); }, 300);
    }

    toggleIntelInline.addEventListener('click', toggleIntelPanel);
    if (intelToggleBtn) intelToggleBtn.addEventListener('click', toggleIntelPanel);

    // Hide right bar on load since panel starts open
    toggleIntelFixed.style.display = 'none';

    // Set initial view padding — panel starts open, so account for its width
    ATLAS.map.setViewPadding({ right: 420, left: 56 });

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

    // Update input placeholder
    var input = document.getElementById('query-input');
    input.placeholder = mode === 'brief'
      ? 'Customize briefing focus or click Generate...'
      : 'Ask ATLAS a question...';
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
  async function runQuery(query, mode) {
    ATLAS.ai.showLoading(getLoadingMessage(mode));
    ATLAS.map.clearHighlights();

    if (mode === 'ask') {
      ATLAS.map.zoomToNation();
    }

    try {
      var response = await ATLAS.ai.analyze(query, mode);
      ATLAS.ai.renderResponse(response);
    } catch (err) {
      console.error('[ATLAS] Query error:', err);
      ATLAS.ai.showError(err.message);
    }
  }

  // --- Show Cached Cron Briefing (instant, no Claude call) ---
  function showCachedBriefing(soloLayerName) {
    if (!cachedBriefingData || !cachedBriefingData.briefing) {
      // No cache yet — fall back to a live query
      runQuery('Provide a comprehensive national threat assessment.', 'ask');
      return;
    }
    ATLAS.map.clearHighlights();
    if (soloLayerName) {
      soloLayer(soloLayerName);
    } else {
      showAllDataLayers();
    }
    ATLAS.map.zoomToNation();
    var briefing = Object.assign({}, cachedBriefingData.briefing);
    briefing.mapCommands = [];  // Don't re-zoom on button press
    ATLAS.ai.renderCachedBanner(cachedBriefingData.generatedAt);
    ATLAS.ai.renderResponse(briefing);
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
      'This is for senior emergency management leadership. Be authoritative and specific.';

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

  // --- Status Hot Buttons ---
  var activeStatusChip = null;

  function buildStatusChips(summary) {
    var container = document.getElementById('status-bar');
    container.innerHTML = '';

    var items = [
      { label: summary.uniqueDisasters + ' FEMA Declarations', icon: 'organization', layer: 'disasters',
        query: 'Focus on active FEMA disaster declarations: what types of disasters are declared, which states are most affected, and what is the operational tempo? Be specific with numbers and locations.' },
      { label: summary.activeFires + ' Active Fires', icon: 'heat-chart', layer: 'fires',
        query: 'Focus on active wildfires: which are the largest and least contained, where are personnel deployed, and which fires pose the greatest threat? Include acreage and containment percentages.' },
    ];
    if (summary.usEarthquakes > 0) {
      items.push({ label: summary.usEarthquakes + ' US Quakes', icon: 'graph-bar-side-by-side', layer: 'quakes',
        query: 'Focus on recent US earthquake activity: what are the largest recent quakes, where are they concentrated, and is there any pattern or elevated seismic risk? Include magnitudes and locations.' });
    }
    items.push({ label: summary.totalAlerts + ' WX Warnings', icon: 'exclamation-mark-circle', layer: 'wwa',
      query: 'Focus on active NWS weather warnings: what severe weather is active, which areas are most impacted, and what is the outlook? Include severity levels and affected regions.' });

    items.forEach(function (item) {
      var chip = document.createElement('button');
      chip.className = 'status-chip active';
      chip.dataset.layer = item.layer;
      chip.innerHTML = '<calcite-icon icon="' + item.icon + '" scale="s"></calcite-icon>' + item.label;
      chip.addEventListener('click', function () {
        var visible = ATLAS.map.toggleLayer(item.layer);
        chip.classList.toggle('active', visible);
        // Sync sidebar layer panel
        var sidebarChip = document.getElementById('toggle-' + item.layer);
        if (sidebarChip) sidebarChip.classList.toggle('active', visible);
        // Zoom to appropriate extent when toggling data layers on
        if (visible && item.layer === 'quakes') {
          ATLAS.map.zoomToQuakeExtent();
        } else if (visible && (item.layer === 'disasters' || item.layer === 'fires' || item.layer === 'wwa')) {
          ATLAS.map.zoomToNation();
        }
      });
      container.appendChild(chip);
    });
  }

  function soloLayer(layerName) {
    ['disasters', 'fires', 'quakes', 'wwa'].forEach(function (name) {
      var shouldShow = name === layerName;
      if (ATLAS.map.isLayerVisible(name) !== shouldShow) {
        ATLAS.map.toggleLayer(name);
      }
      var sidebarChip = document.getElementById('toggle-' + name);
      if (sidebarChip) sidebarChip.classList.toggle('active', shouldShow);
    });
  }

  function showAllDataLayers() {
    ['disasters', 'fires', 'quakes', 'wwa'].forEach(function (name) {
      if (!ATLAS.map.isLayerVisible(name)) ATLAS.map.toggleLayer(name);
      var sidebarChip = document.getElementById('toggle-' + name);
      if (sidebarChip) sidebarChip.classList.add('active');
    });
  }

  // --- Loading Messages ---
  function getLoadingMessage(mode) {
    return mode === 'brief'
      ? 'Generating executive briefing...'
      : 'ATLAS is analyzing threat data...';
  }

  // --- Update Status Chip ---
  function updateStatus(text) {
    var chip = document.getElementById('data-status');
    chip.innerHTML = '<calcite-icon icon="clock" scale="s"></calcite-icon>' + text;
  }

  // --- Boot ---
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();

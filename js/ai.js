/* ============================================================
   ATLAS AI Module
   Sends queries to /api/chat, renders structured responses
   with staggered reveal animations
   ============================================================ */

window.ATLAS = window.ATLAS || {};

ATLAS.ai = (function () {

  // --- Send Query to API ---
  async function analyze(query, mode, region) {
    var context = ATLAS.data.getAIContext(region);

    var res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: query,
        mode: mode || 'ask',
        context: context
      })
    });

    if (!res.ok) {
      var errData = await res.json().catch(function () { return {}; });
      throw new Error(errData.message || 'Analysis failed (' + res.status + ')');
    }

    return await res.json();
  }

  // --- Render Full Response ---
  function renderResponse(data) {
    var container = document.getElementById('ai-response');
    var narrativeEl = document.getElementById('response-narrative');
    var rankingsEl = document.getElementById('response-rankings');
    var actionsEl = document.getElementById('response-actions');

    // Clear previous
    narrativeEl.innerHTML = '';
    rankingsEl.innerHTML = '';
    actionsEl.innerHTML = '';

    // Render rankings first (top of panel, clickable)
    if (data.rankings && data.rankings.length > 0) {
      renderRankings(data.rankings, rankingsEl);
    }

    // Render narrative (Intelligence Assessment)
    if (data.narrative) {
      renderNarrative(data.narrative, narrativeEl);
    }

    // Render actions
    if (data.actions && data.actions.length > 0) {
      renderActions(data.actions, actionsEl);
    }

    // Execute map commands
    if (data.mapCommands) {
      ATLAS.map.executeMapCommands(data.mapCommands);
    }

    // Show numbered markers on map for rankings
    if (data.rankings && data.rankings.length > 0) {
      ATLAS.map.showRankingMarkers(data.rankings);
    }

    // Show response, hide welcome/loading
    document.getElementById('welcome-state').hidden = true;
    document.getElementById('loading-state').hidden = true;
    container.hidden = false;

    // Stagger reveal all rendered elements
    animateResponse();
  }

  // --- Staggered Reveal Animation ---
  function animateResponse() {
    var items = document.querySelectorAll(
      '#response-rankings .intel-section > *, #response-rankings .ranking-item, ' +
      '#response-narrative .intel-section > *, ' +
      '#response-actions .intel-section > *, #response-actions .action-item'
    );

    items.forEach(function (item, i) {
      item.classList.add('stagger-in');
      item.style.animationDelay = (i * 0.06) + 's';
    });
  }

  // --- Render Narrative ---
  function renderNarrative(text, el) {
    var html = '<div class="intel-section">';
    html += '<div class="red-rule"></div>';
    html += '<h3 class="dragon-headline">Intelligence Assessment</h3>';

    // Convert [[loc:Name:lat:lon]] to clickable spans
    var processed = text.replace(/\[\[loc:(.*?):([-\d.]+):([-\d.]+)\]\]/g, function (match, name, lat, lon) {
      return '<span class="location-link" data-lat="' + lat + '" data-lon="' + lon + '">' + name + '</span>';
    });

    // Convert **bold** to <strong>
    processed = processed.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');

    // Check if content has bullet points
    var lines = processed.split('\n').filter(function (l) { return l.trim(); });
    var hasBullets = lines.some(function (l) { return l.trim().match(/^[-•]\s/); });

    if (hasBullets) {
      var inList = false;
      lines.forEach(function (line) {
        var trimmed = line.trim();
        if (trimmed.match(/^[-•]\s/)) {
          if (!inList) { html += '<ul class="narrative-bullets">'; inList = true; }
          html += '<li class="narrative-bullet">' + trimmed.replace(/^[-•]\s+/, '') + '</li>';
        } else {
          if (inList) { html += '</ul>'; inList = false; }
          html += '<p class="narrative-text">' + trimmed + '</p>';
        }
      });
      if (inList) html += '</ul>';
    } else {
      // Paragraph mode (fallback for non-bullet responses)
      var formatted = processed
        .split('\n\n')
        .filter(function (p) { return p.trim(); })
        .map(function (p) { return '<p class="narrative-text">' + p.trim() + '</p>'; })
        .join('');
      if (!formatted) {
        formatted = '<p class="narrative-text">' + processed + '</p>';
      }
      html += formatted;
    }

    html += '</div>';
    el.innerHTML = html;

    // Wire click handlers on location links
    el.querySelectorAll('.location-link').forEach(function (link) {
      link.addEventListener('click', function () {
        var lat = parseFloat(link.dataset.lat);
        var lon = parseFloat(link.dataset.lon);
        if (lat && lon) {
          ATLAS.map.zoomTo(lat, lon, 8);
          ATLAS.map.highlightLocations([{ lat: lat, lon: lon }]);
        }
      });
    });
  }

  // --- Render Metric Cards ---
  function renderMetrics(metrics, el) {
    var html = '<div class="intel-section">';
    html += '<div class="section-header"><div class="red-rule"></div><h4>Key Metrics</h4></div>';
    html += '<div class="stat-grid">';

    metrics.forEach(function (m, i) {
      var highlightClass = i === 0 ? ' highlight' : '';
      var trendHtml = '';
      if (m.trend) {
        var arrow = m.trend === 'up' ? '\u2191' : m.trend === 'down' ? '\u2193' : '\u2192';
        trendHtml = '<div class="stat-trend ' + m.trend + '">' + arrow + ' ' + m.trend + '</div>';
      }

      html += '<div class="stat-card">';
      html += '<div class="stat-value' + highlightClass + '">' + escapeHtml(m.value) + '</div>';
      html += '<div class="stat-label">' + escapeHtml(m.label) + '</div>';
      html += trendHtml;
      html += '</div>';
    });

    html += '</div></div>';
    el.innerHTML = html;
  }

  // --- Render Risk Rankings ---
  function renderRankings(rankings, el) {
    var html = '<div class="intel-section">';
    html += '<div class="section-header"><div class="red-rule"></div><h4>Risk Rankings</h4></div>';
    html += '<ul class="ranking-list">';

    rankings.forEach(function (r) {
      var severityClass = 'severity-' + (r.severity || 'moderate');

      html += '<li class="ranking-item" data-lat="' + (r.lat || '') + '" data-lon="' + (r.lon || '') + '" data-state="' + (r.state || '') + '">';
      html += '<span class="rank-number">' + r.rank + '</span>';
      html += '<div class="rank-content">';
      html += '<div class="rank-location">' + escapeHtml(r.location) + '</div>';
      html += '<div class="rank-factors">' + escapeHtml(r.factors) + '</div>';
      html += '</div>';
      html += '<span class="rank-score"><span class="severity-chip ' + severityClass + '">' + escapeHtml(r.score) + '</span></span>';
      html += '</li>';
    });

    html += '</ul></div>';
    el.innerHTML = html;

    // Add click handlers to ranking items
    el.querySelectorAll('.ranking-item').forEach(function (item) {
      item.addEventListener('click', function () {
        var lat = parseFloat(item.dataset.lat);
        var lon = parseFloat(item.dataset.lon);
        var state = item.dataset.state;
        if (lat && lon) {
          ATLAS.map.zoomTo(lat, lon, 7);
        } else if (state) {
          ATLAS.map.zoomToState(state);
        }
      });
    });
  }

  // --- Render Action Items ---
  function renderActions(actions, el) {
    var html = '<div class="intel-section">';
    html += '<div class="section-header"><div class="red-rule"></div><h4>Recommended Actions</h4></div>';
    html += '<ul class="action-list">';

    actions.forEach(function (a) {
      var priorityClass = 'priority-' + (a.priority || 'medium');

      html += '<li class="action-item">';
      html += '<span class="action-priority ' + priorityClass + '">' + escapeHtml(a.priority || 'medium').toUpperCase() + '</span>';
      html += '<div>';
      html += '<div class="action-text">' + escapeHtml(a.action) + '</div>';
      if (a.rationale) {
        html += '<div class="action-rationale">' + escapeHtml(a.rationale) + '</div>';
      }
      html += '</div>';
      html += '</li>';
    });

    html += '</ul></div>';
    el.innerHTML = html;
  }

  // --- Show/Hide Loading ---
  function showLoading(message) {
    document.getElementById('welcome-state').hidden = true;
    document.getElementById('ai-response').hidden = true;
    document.getElementById('loading-state').hidden = false;
    document.querySelector('.loading-text').textContent = message || 'ATLAS is analyzing threat data...';
  }

  function hideLoading() {
    document.getElementById('loading-state').hidden = true;
  }

  // --- Show Error ---
  function showError(message) {
    hideLoading();
    var narrativeEl = document.getElementById('response-narrative');
    narrativeEl.innerHTML = '<div class="intel-section"><div class="error-banner"><div class="error-title">Analysis Error</div><div class="error-message">' + escapeHtml(message) + '</div></div></div>';
    document.getElementById('ai-response').hidden = false;
  }

  // --- Export PDF ---
  async function exportPDF() {
    // Capture map screenshot
    var screenshot = await ATLAS.map.takeScreenshot();
    var mapImg = screenshot ? screenshot.dataUrl : '';

    // Grab rendered intel content
    var rankingsHtml = document.getElementById('response-rankings').innerHTML;
    var narrativeHtml = document.getElementById('response-narrative').innerHTML;
    var actionsHtml = document.getElementById('response-actions').innerHTML;

    var now = new Date();
    var dateStr = now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    var timeStr = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });

    // Build print document
    var html = '<!DOCTYPE html><html><head><meta charset="UTF-8">' +
      '<title>ATLAS Intelligence Briefing — ' + dateStr + '</title>' +
      '<link href="https://fonts.googleapis.com/css2?family=Libre+Baskerville:wght@400;700&family=Source+Sans+Pro:wght@400;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap" rel="stylesheet">' +
      '<style>' +
      '*, *::before, *::after { box-sizing: border-box; }' +
      'body { font-family: "Source Sans Pro", sans-serif; color: #1a1816; margin: 0; padding: 40px 50px; line-height: 1.5; }' +
      '.header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px; }' +
      '.header h1 { font-family: "Libre Baskerville", serif; font-size: 22px; margin: 0; }' +
      '.header .date { font-family: "IBM Plex Mono", monospace; font-size: 11px; color: #666; text-align: right; }' +
      '.red-rule { width: 50px; height: 3px; background: #ED1B2E; margin-bottom: 20px; }' +
      '.map-container { margin-bottom: 24px; }' +
      '.map-container img { width: 100%; border: 1px solid #ddd; border-radius: 4px; }' +
      '.intel-section { margin-bottom: 20px; }' +
      '.intel-section + .intel-section { padding-top: 16px; border-top: 1px solid #e5e5e5; }' +
      '.section-header { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; }' +
      '.section-header .red-rule { width: 30px; height: 2px; margin-bottom: 0; }' +
      '.section-header h4 { font-family: "Libre Baskerville", serif; font-size: 14px; margin: 0; }' +
      '.dragon-headline { font-family: "Libre Baskerville", serif; font-size: 16px; margin: 0 0 10px; }' +
      '.narrative-text { font-size: 13px; line-height: 1.6; margin: 0 0 8px; }' +
      '.narrative-bullets { padding: 0; margin: 0 0 10px; list-style: none; }' +
      '.narrative-bullet { font-size: 13px; line-height: 1.5; padding: 3px 0 3px 14px; position: relative; border-bottom: 1px solid #f0f0f0; }' +
      '.narrative-bullet::before { content: ""; position: absolute; left: 0; top: 10px; width: 5px; height: 5px; border-radius: 50%; background: #ED1B2E; }' +
      '.ranking-list { list-style: none; padding: 0; margin: 0; }' +
      '.ranking-item { display: flex; align-items: flex-start; gap: 10px; padding: 8px 0; border-bottom: 1px solid #e5e5e5; }' +
      '.ranking-item:last-child { border-bottom: none; }' +
      '.rank-number { font-family: "IBM Plex Mono", monospace; font-size: 14px; font-weight: 500; color: #ED1B2E; min-width: 18px; }' +
      '.rank-content { flex: 1; }' +
      '.rank-location { font-size: 13px; font-weight: 600; margin-bottom: 2px; }' +
      '.rank-factors { font-size: 11px; color: #666; line-height: 1.4; }' +
      '.rank-score { flex-shrink: 0; }' +
      '.severity-chip { font-family: "IBM Plex Mono", monospace; font-size: 10px; padding: 2px 6px; border-radius: 2px; }' +
      '.severity-critical { background: #fde8ea; color: #c41e3a; }' +
      '.severity-high { background: #fff3e0; color: #c45a00; }' +
      '.severity-moderate { background: #fef9e7; color: #8a6d00; }' +
      '.severity-low { background: #e8f5e9; color: #2d6a2e; }' +
      '.action-list { list-style: none; padding: 0; margin: 0; }' +
      '.action-item { display: flex; gap: 10px; padding: 8px 0; border-bottom: 1px solid #e5e5e5; }' +
      '.action-item:last-child { border-bottom: none; }' +
      '.action-priority { font-family: "IBM Plex Mono", monospace; font-size: 10px; padding: 2px 6px; border-radius: 2px; flex-shrink: 0; height: fit-content; margin-top: 2px; }' +
      '.priority-immediate, .priority-high { background: #fde8ea; color: #c41e3a; }' +
      '.priority-medium { background: #fef9e7; color: #8a6d00; }' +
      '.priority-low { background: #e8f5e9; color: #2d6a2e; }' +
      '.action-text { font-size: 13px; line-height: 1.5; }' +
      '.action-rationale { font-size: 11px; color: #666; margin-top: 3px; font-style: italic; }' +
      '.footer { margin-top: 30px; padding-top: 12px; border-top: 1px solid #e5e5e5; font-family: "IBM Plex Mono", monospace; font-size: 10px; color: #999; display: flex; justify-content: space-between; }' +
      '.location-link { color: inherit; text-decoration: none; }' +
      '@media print { body { padding: 20px 30px; } .map-container img { max-height: 350px; object-fit: contain; } }' +
      '</style></head><body>' +
      '<div class="header">' +
      '<h1>ATLAS Intelligence Briefing</h1>' +
      '<div class="date">' + dateStr + '<br>' + timeStr + '</div>' +
      '</div>' +
      '<div class="red-rule"></div>';

    if (mapImg) {
      html += '<div class="map-container"><img src="' + mapImg + '" alt="Situation Map"></div>';
    }

    html += rankingsHtml + narrativeHtml + actionsHtml;

    html += '<div class="footer"><span>ATLAS — AI Threat-Level Analysis System</span><span>For Official Use</span></div>';
    html += '</body></html>';

    var win = window.open('', '_blank');
    win.document.write(html);
    win.document.close();
    win.onload = function () { win.print(); };
  }

  // --- Utility ---
  function escapeHtml(str) {
    if (!str) return '';
    var div = document.createElement('div');
    div.textContent = String(str);
    return div.innerHTML;
  }

  // --- Render Cached Briefing Banner ---
  function renderCachedBanner(generatedAt) {
    var banner = document.getElementById('briefing-banner');
    if (!banner || !generatedAt) return;

    var generated = new Date(generatedAt);
    var now = new Date();
    var diffMs = now - generated;
    var diffMins = Math.floor(diffMs / 60000);
    var timeAgo;
    if (diffMins < 60) {
      timeAgo = diffMins + ' min ago';
    } else {
      var diffHrs = Math.floor(diffMins / 60);
      timeAgo = diffHrs + (diffHrs === 1 ? ' hour ago' : ' hours ago');
    }

    banner.innerHTML = '<span class="banner-icon">&#9432;</span>' +
      '<span class="banner-text">Briefing generated <strong>' + timeAgo + '</strong> &mdash; ' +
      generated.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true }) +
      '</span>' +
      '<span class="banner-live">CACHED</span>';
    banner.hidden = false;
  }

  return {
    analyze: analyze,
    renderResponse: renderResponse,
    renderCachedBanner: renderCachedBanner,
    showLoading: showLoading,
    hideLoading: hideLoading,
    showError: showError,
    exportPDF: exportPDF
  };

})();

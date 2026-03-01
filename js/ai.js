/* ============================================================
   ATLAS AI Module
   Sends queries to /api/chat, renders structured responses
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
    var metricsEl = document.getElementById('response-metrics');
    var rankingsEl = document.getElementById('response-rankings');
    var actionsEl = document.getElementById('response-actions');

    // Clear previous
    narrativeEl.innerHTML = '';
    metricsEl.innerHTML = '';
    rankingsEl.innerHTML = '';
    actionsEl.innerHTML = '';

    // Render narrative
    if (data.narrative) {
      renderNarrative(data.narrative, narrativeEl);
    }

    // Render metrics
    if (data.metrics && data.metrics.length > 0) {
      renderMetrics(data.metrics, metricsEl);
    }

    // Render rankings
    if (data.rankings && data.rankings.length > 0) {
      renderRankings(data.rankings, rankingsEl);
    }

    // Render actions
    if (data.actions && data.actions.length > 0) {
      renderActions(data.actions, actionsEl);
    }

    // Execute map commands
    if (data.mapCommands) {
      ATLAS.map.executeMapCommands(data.mapCommands);
    }

    // Highlight ranked locations on map
    if (data.rankings && data.rankings.length > 0) {
      var locs = data.rankings
        .filter(function (r) { return r.lat && r.lon; })
        .map(function (r) { return { lat: r.lat, lon: r.lon }; });
      ATLAS.map.highlightLocations(locs);
    }

    // Show response, hide welcome/loading
    document.getElementById('welcome-state').hidden = true;
    document.getElementById('loading-state').hidden = true;
    container.hidden = false;
  }

  // --- Render Narrative ---
  function renderNarrative(text, el) {
    var html = '<div class="intel-section">';
    html += '<div class="red-rule"></div>';
    html += '<h3 class="dragon-headline">Intelligence Assessment</h3>';

    // Convert **bold** to <strong> and split paragraphs
    var formatted = text
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .split('\n\n')
      .filter(function (p) { return p.trim(); })
      .map(function (p) { return '<p class="narrative-text">' + p.trim() + '</p>'; })
      .join('');

    // If it's a single block without double-newlines, just wrap it
    if (!formatted) {
      formatted = '<p class="narrative-text">' + text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') + '</p>';
    }

    html += formatted;
    html += '</div>';
    el.innerHTML = html;
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
          ATLAS.map.showSVI(true);
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
    narrativeEl.innerHTML = '<div class="intel-section"><calcite-notice kind="danger" open><div slot="title">Analysis Error</div><div slot="message">' + escapeHtml(message) + '</div></calcite-notice></div>';
    document.getElementById('ai-response').hidden = false;
  }

  // --- Utility ---
  function escapeHtml(str) {
    if (!str) return '';
    var div = document.createElement('div');
    div.textContent = String(str);
    return div.innerHTML;
  }

  return {
    analyze: analyze,
    renderResponse: renderResponse,
    showLoading: showLoading,
    hideLoading: hideLoading,
    showError: showError
  };

})();

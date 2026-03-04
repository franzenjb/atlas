/* ============================================================
   ATLAS Map Module
   ArcGIS Map with disaster/alert layers + AI-driven commands
   ============================================================ */

window.ATLAS = window.ATLAS || {};

ATLAS.map = (function () {

  let view = null;
  let map = null;
  let disasterLayer = null;
  let alertLayer = null;
  let fireLayer = null;
  let earthquakeLayer = null;
  let highlightLayer = null;
  let sviLayer = null;
  let radarLayer = null;
  let qpfLayer = null;
  let wwaLayer = null;
  let spcLayer = null;
  let cigLayer = null;
  let nhcLayer = null;
  let eroLayer = null;
  let countySource = null;
  let pulseOverlays = [];
  let _allFires = [];
  let _hideContained = false;

  // State coordinates for zooming
  const stateCoords = {
    AL: { lat: 32.8, lon: -86.8, zoom: 7 }, AK: { lat: 64.2, lon: -152.5, zoom: 4 },
    AZ: { lat: 34.0, lon: -111.1, zoom: 7 }, AR: { lat: 35.2, lon: -91.8, zoom: 7 },
    CA: { lat: 36.8, lon: -119.4, zoom: 6 }, CO: { lat: 39.1, lon: -105.3, zoom: 7 },
    CT: { lat: 41.6, lon: -72.7, zoom: 9 }, DE: { lat: 39.0, lon: -75.5, zoom: 9 },
    FL: { lat: 27.8, lon: -81.7, zoom: 7 }, GA: { lat: 32.7, lon: -83.5, zoom: 7 },
    HI: { lat: 19.9, lon: -155.6, zoom: 7 }, ID: { lat: 44.1, lon: -114.7, zoom: 6 },
    IL: { lat: 40.3, lon: -89.0, zoom: 7 }, IN: { lat: 40.3, lon: -86.1, zoom: 7 },
    IA: { lat: 42.0, lon: -93.2, zoom: 7 }, KS: { lat: 38.5, lon: -98.7, zoom: 7 },
    KY: { lat: 37.8, lon: -84.3, zoom: 7 }, LA: { lat: 30.5, lon: -91.9, zoom: 7 },
    ME: { lat: 45.3, lon: -69.4, zoom: 7 }, MD: { lat: 39.0, lon: -76.6, zoom: 8 },
    MA: { lat: 42.4, lon: -71.4, zoom: 8 }, MI: { lat: 44.3, lon: -84.5, zoom: 7 },
    MN: { lat: 46.7, lon: -94.7, zoom: 6 }, MS: { lat: 32.3, lon: -89.4, zoom: 7 },
    MO: { lat: 38.6, lon: -92.6, zoom: 7 }, MT: { lat: 46.8, lon: -110.4, zoom: 6 },
    NE: { lat: 41.1, lon: -98.3, zoom: 7 }, NV: { lat: 38.8, lon: -116.4, zoom: 6 },
    NH: { lat: 43.5, lon: -71.5, zoom: 8 }, NJ: { lat: 40.1, lon: -74.5, zoom: 8 },
    NM: { lat: 34.3, lon: -105.9, zoom: 7 }, NY: { lat: 43.0, lon: -75.5, zoom: 7 },
    NC: { lat: 35.6, lon: -79.8, zoom: 7 }, ND: { lat: 47.5, lon: -100.4, zoom: 7 },
    OH: { lat: 40.4, lon: -82.6, zoom: 7 }, OK: { lat: 35.0, lon: -97.1, zoom: 7 },
    OR: { lat: 43.8, lon: -120.6, zoom: 7 }, PA: { lat: 41.2, lon: -77.2, zoom: 7 },
    RI: { lat: 41.6, lon: -71.5, zoom: 10 }, SC: { lat: 33.8, lon: -81.2, zoom: 8 },
    SD: { lat: 43.9, lon: -99.4, zoom: 7 }, TN: { lat: 35.5, lon: -86.0, zoom: 7 },
    TX: { lat: 31.9, lon: -99.9, zoom: 6 }, UT: { lat: 39.3, lon: -111.1, zoom: 7 },
    VT: { lat: 44.6, lon: -72.6, zoom: 8 }, VA: { lat: 37.4, lon: -78.7, zoom: 7 },
    WA: { lat: 47.8, lon: -120.7, zoom: 7 }, WV: { lat: 38.6, lon: -80.4, zoom: 7 },
    WI: { lat: 43.8, lon: -88.8, zoom: 7 }, WY: { lat: 43.1, lon: -107.6, zoom: 7 },
    DC: { lat: 38.9, lon: -77.0, zoom: 11 }, PR: { lat: 18.2, lon: -66.5, zoom: 9 },
    GU: { lat: 13.4, lon: 144.8, zoom: 10 }
  };

  // SVG paths for descriptive icons (24x24 viewbox, centered on 12,12)
  const iconPaths = {
    // Shield — FEMA disasters
    shield: 'M12 1 L3 5 L3 11 C3 17.5 7 22.5 12 24 C17 22.5 21 17.5 21 11 L21 5 Z',
    // Flame — wildfires
    flame: 'M12 0 C12 0 7 7 7 12 C7 14.8 8.5 17.2 10.5 18.5 C9.5 17 9 15.5 10 13.5 C11 11.5 12 10 12 10 C12 10 13 11.5 14 13.5 C15 15.5 14.5 17 13.5 18.5 C15.5 17.2 17 14.8 17 12 C17 7 12 0 12 0 Z',
    // Seismic/bullseye — earthquakes (concentric target)
    seismic: 'M12 0 A12 12 0 1 0 12 24 A12 12 0 1 0 12 0 Z M12 4 A8 8 0 1 1 12 20 A8 8 0 1 1 12 4 Z M12 8 A4 4 0 1 0 12 16 A4 4 0 1 0 12 8 Z'
  };

  // Severity colors for map symbols
  const severityColors = {
    Extreme:  [237, 27, 46],     // Red
    Severe:   [249, 115, 22],    // Orange
    Moderate: [234, 179, 8],     // Yellow
    Minor:    [34, 197, 94],     // Green
    Unknown:  [156, 163, 175]    // Gray
  };

  // Disaster type colors
  const disasterColors = {
    Hurricane:  [237, 27, 46],
    Tornado:    [249, 115, 22],
    'Severe Storm': [234, 179, 8],
    Flood:      [59, 130, 246],
    Fire:       [249, 115, 22],
    Earthquake: [139, 92, 246],
    'Snow':     [147, 197, 253],
    'Severe Ice Storm': [147, 197, 253],
    default:    [156, 163, 175]
  };

  function init() {
    return new Promise(function (resolve) {
      require([
        'esri/Map',
        'esri/views/MapView',
        'esri/Graphic',
        'esri/layers/GraphicsLayer',
        'esri/layers/FeatureLayer',
        'esri/layers/MapImageLayer',
        'esri/geometry/Extent'
      ], function (Map, MapView, Graphic, GraphicsLayer, FeatureLayer, MapImageLayer, Extent) {

        disasterLayer = new GraphicsLayer({ title: 'FEMA Disasters' });
        alertLayer = new GraphicsLayer({ title: 'NWS Alerts' });
        fireLayer = new GraphicsLayer({ title: 'Active Wildfires' });
        earthquakeLayer = new GraphicsLayer({ title: 'Earthquakes' });
        highlightLayer = new GraphicsLayer({ title: 'Highlights' });
        cigLayer = new GraphicsLayer({ title: 'SPC Conditional Intensity', visible: false });

        // CDC SVI layer from Living Atlas
        sviLayer = new FeatureLayer({
          url: 'https://services3.arcgis.com/ZvidGQkLaDJxRSJ2/arcgis/rest/services/CDC_ATSDR_Social_Vulnerability_Index_2022_USA/FeatureServer/1',
          title: 'Social Vulnerability Index',
          visible: false,
          opacity: 0.5,
          renderer: {
            type: 'class-breaks',
            field: 'RPL_THEMES',
            classBreakInfos: [
              { minValue: 0, maxValue: 0.25, symbol: { type: 'simple-fill', color: [34, 197, 94, 80], outline: { width: 0.3, color: [255, 255, 255, 40] } }, label: 'Low (0-0.25)' },
              { minValue: 0.25, maxValue: 0.5, symbol: { type: 'simple-fill', color: [234, 179, 8, 80], outline: { width: 0.3, color: [255, 255, 255, 40] } }, label: 'Moderate (0.25-0.5)' },
              { minValue: 0.5, maxValue: 0.75, symbol: { type: 'simple-fill', color: [249, 115, 22, 80], outline: { width: 0.3, color: [255, 255, 255, 40] } }, label: 'High (0.5-0.75)' },
              { minValue: 0.75, maxValue: 1.0, symbol: { type: 'simple-fill', color: [237, 27, 46, 80], outline: { width: 0.3, color: [255, 255, 255, 40] } }, label: 'Very High (0.75-1.0)' }
            ]
          }
        });

        // NEXRAD Radar — live precipitation
        radarLayer = new MapImageLayer({
          url: 'https://mapservices.weather.noaa.gov/eventdriven/rest/services/radar/radar_base_reflectivity/MapServer',
          title: 'Weather Radar',
          visible: false,
          opacity: 0.6,
          sublayers: [{ id: 0 }]
        });

        // QPF — Quantitative Precipitation Forecast (Day 1)
        qpfLayer = new MapImageLayer({
          url: 'https://mapservices.weather.noaa.gov/vector/rest/services/precip/wpc_qpf/MapServer',
          title: 'Precipitation Forecast',
          visible: false,
          opacity: 0.5,
          sublayers: [{ id: 1 }]
        });

        // Watches/Warnings/Advisories — official NWS polygons
        wwaLayer = new MapImageLayer({
          url: 'https://mapservices.weather.noaa.gov/eventdriven/rest/services/WWA/watch_warn_adv/MapServer',
          title: 'Watches & Warnings',
          visible: false,
          opacity: 0.5,
          sublayers: [{ id: 1 }]
        });

        // SPC Convective Outlook — live GeoJSON from spc.noaa.gov
        spcLayer = new GraphicsLayer({ title: 'SPC Convective Outlook', visible: false });

        // NHC Tropical Weather — active storms, forecast cones
        nhcLayer = new MapImageLayer({
          url: 'https://mapservices.weather.noaa.gov/tropical/rest/services/tropical/NHC_tropical_weather/MapServer',
          title: 'NHC Tropical',
          visible: false,
          opacity: 0.6
        });

        // WPC Excessive Rainfall Outlook — flash flood risk
        eroLayer = new MapImageLayer({
          url: 'https://mapservices.weather.noaa.gov/vector/rest/services/hazards/wpc_precip_hazards/MapServer',
          title: 'Excessive Rainfall Outlook',
          visible: false,
          opacity: 0.5,
          sublayers: [{ id: 0 }] // Day 1 ERO
        });

        map = new Map({
          basemap: 'dark-gray-vector',
          layers: [sviLayer, radarLayer, qpfLayer, wwaLayer, spcLayer, cigLayer, nhcLayer, eroLayer, alertLayer, disasterLayer, fireLayer, earthquakeLayer, highlightLayer]
        });

        view = new MapView({
          container: 'viewDiv',
          map: map,
          center: [-98.5, 39.8],
          zoom: 4,
          ui: { components: ['attribution'] },
          popup: { autoOpenEnabled: true, dockEnabled: false },
          constraints: { minZoom: 3 }
        });

        // Padding — sidebar is 44px collapsed + gap
        view.ui.padding = { top: 8, left: 56, right: 15, bottom: 15 };

        // County boundary source for FEMA choropleth (query-only, not added to map)
        countySource = new FeatureLayer({
          url: 'https://services.arcgis.com/QVENGdaPbd4LUkLV/ArcGIS/rest/services/USA_Counties/FeatureServer/0'
        });

        // Store module references for graphic creation
        ATLAS.map._Graphic = Graphic;
        ATLAS.map._Extent = Extent;
        ATLAS.map._view = view;

        view.when(function () {
          // Remove loading scrim
          var scrim = document.getElementById('map-scrim');
          if (scrim) {
            scrim.loading = false;
            setTimeout(function () { scrim.style.display = 'none'; }, 300);
          }
          // Build the map legend from config
          buildLegend();
          console.log('[ATLAS] Map ready');
          resolve(view);
        });

        // Click handler for all data layers + ranking markers
        view.on('click', function (event) {
          view.hitTest(event).then(function (response) {
            // Check ranking markers first (highlightLayer)
            var rankHit = response.results.find(function (r) {
              return r.graphic.layer === highlightLayer && r.graphic.attributes && r.graphic.popupTemplate;
            });
            if (rankHit) {
              view.openPopup({
                features: [rankHit.graphic],
                location: event.mapPoint
              });
              return;
            }

            // Then check data layers
            var result = response.results.find(function (r) {
              return r.graphic.layer === disasterLayer || r.graphic.layer === alertLayer || r.graphic.layer === fireLayer || r.graphic.layer === earthquakeLayer;
            });
            if (result && result.graphic.attributes) {
              var attrs = result.graphic.attributes;
              if (attrs.lat && attrs.lon) {
                zoomTo(attrs.lat, attrs.lon, 8);
              }
              document.dispatchEvent(new CustomEvent('atlas-feature-click', { detail: attrs }));
            }
          });
        });
      });
    });
  }

  // --- Add FEMA Disaster Graphics (county choropleth) ---
  async function addDisasters(disasters) {
    if (!disasterLayer) return;
    disasterLayer.removeAll();

    var Graphic = ATLAS.map._Graphic;

    // Group disasters by 5-digit FIPS (skip statewide "000" and invalid codes)
    var byFips = {};
    disasters.forEach(function (d) {
      if (!d.fips || d.fips.length !== 5 || d.fips.endsWith('000')) return;
      if (!byFips[d.fips]) byFips[d.fips] = [];
      byFips[d.fips].push(d);
    });

    var fipsList = Object.keys(byFips);
    if (fipsList.length === 0) {
      console.log('[ATLAS] No county FIPS codes to map');
      return;
    }

    // Query county boundaries from Living Atlas
    try {
      var whereClause = "FIPS IN ('" + fipsList.join("','") + "')";
      var results = await countySource.queryFeatures({
        where: whereClause,
        outFields: ['FIPS', 'NAME', 'STATE_NAME'],
        returnGeometry: true
      });

      results.features.forEach(function (feature) {
        var fips = feature.attributes.FIPS;
        var records = byFips[fips];
        if (!records || records.length === 0) return;

        var primary = records[0];
        var color = disasterColors[primary.type] || disasterColors.default;
        var countyName = feature.attributes.NAME || '';
        var stateName = feature.attributes.STATE_NAME || primary.state;

        // Build popup rows for each declaration in this county
        var rows = records.map(function (r, i) {
          var bg = i % 2 === 0 ? 'background:rgba(255,255,255,0.04);' : '';
          var declType = r.declarationType === 'EM' ? 'Emergency' : 'Major Disaster';
          var dateStr = r.declarationDate ? r.declarationDate.split('T')[0] : '';
          var programs = r.programsActive ? r.programsActive.join(', ') : '';
          return '<tr style="' + bg + '"><td style="padding:6px 10px;color:#a09890;width:80px;">' + r.type + '</td>' +
            '<td style="padding:6px 10px;">' + r.title +
            '<div style="font-size:11px;color:#a09890;margin-top:2px;">DR-' + r.id + ' · ' + declType + ' · ' + dateStr + '</div>' +
            (programs ? '<div style="font-size:11px;color:#a09890;">Programs: ' + programs + '</div>' : '') +
            '</td></tr>';
        });

        var popupContent = '<div style="font-family:\'Source Sans Pro\',sans-serif;color:#f7f5f2;">' +
          '<div style="background:#8b1a1a;padding:6px 12px;margin:-12px -12px 12px;font-family:\'IBM Plex Mono\',monospace;font-size:11px;letter-spacing:1px;text-transform:uppercase;color:#fff;">' +
          records.length + ' ACTIVE DECLARATION' + (records.length > 1 ? 'S' : '') + '</div>' +
          '<table style="width:100%;border-collapse:collapse;font-size:13px;">' +
          rows.join('') +
          '<tr><td colspan="2" style="padding:8px 10px;text-align:center;">' +
          '<a href="https://www.fema.gov/disaster/' + primary.id + '" target="_blank" rel="noopener" style="color:#ff6b4a;text-decoration:none;font-family:\'IBM Plex Mono\',monospace;font-size:11px;letter-spacing:0.5px;">FEMA Disaster Page ↗</a>' +
          '</td></tr></table></div>';

        var graphic = new Graphic({
          geometry: feature.geometry,
          symbol: {
            type: 'simple-fill',
            color: [color[0], color[1], color[2], 100],
            outline: { color: [color[0], color[1], color[2], 200], width: 1 }
          },
          attributes: {
            id: primary.id,
            title: primary.title,
            type: primary.type,
            state: primary.state,
            county: countyName,
            source: 'FEMA'
          },
          popupTemplate: {
            title: '<span style="font-family:\'Libre Baskerville\',serif;">' + countyName + ', ' + stateName + '</span>',
            content: popupContent
          }
        });

        disasterLayer.add(graphic);
      });

      console.log('[ATLAS] Added ' + disasterLayer.graphics.length + ' disaster county polygons (' + fipsList.length + ' FIPS queried)');

    } catch (err) {
      console.error('[ATLAS] County query error:', err);
    }
  }

  // --- Add NWS Alert Graphics ---
  function addAlerts(alerts) {
    if (!alertLayer) return;
    alertLayer.removeAll();

    var Graphic = ATLAS.map._Graphic;

    var popupTpl = {
      title: '<span style="font-family:\'Libre Baskerville\',serif;">{event}</span>',
      content: '<div style="font-family:\'Source Sans Pro\',sans-serif;color:#f7f5f2;">' +
        '<div style="background:{sevBg};padding:6px 12px;margin:-12px -12px 12px;font-family:\'IBM Plex Mono\',monospace;font-size:11px;letter-spacing:1px;text-transform:uppercase;color:#fff;">{severity}</div>' +
        '<table style="width:100%;border-collapse:collapse;font-size:13px;">' +
        '<tr style="background:rgba(255,255,255,0.04);"><td style="padding:6px 10px;color:#a09890;width:80px;">Areas</td><td style="padding:6px 10px;">{areas}</td></tr>' +
        '<tr><td style="padding:6px 10px;color:#a09890;">Expires</td><td style="padding:6px 10px;">{expires}</td></tr>' +
        '</table></div>'
    };

    alerts.forEach(function (a) {
      var color = severityColors[a.severity] || severityColors.Unknown;
      var sevBg = '#6b7280';
      if (a.severity === 'Extreme') sevBg = '#ef4444';
      else if (a.severity === 'Severe') sevBg = '#f97316';
      else if (a.severity === 'Moderate') sevBg = '#eab308';
      else if (a.severity === 'Minor') sevBg = '#22c55e';

      var attrs = {
        event: a.event,
        severity: a.severity,
        headline: a.headline,
        areas: a.areas,
        expires: a.expires,
        sevBg: sevBg,
        source: 'NWS',
        lat: a.lat,
        lon: a.lon
      };

      if (a.geometry && a.geometry.type === 'Polygon') {
        alertLayer.add(new Graphic({
          geometry: { type: 'polygon', rings: a.geometry.coordinates },
          symbol: {
            type: 'simple-fill',
            color: [color[0], color[1], color[2], 70],
            outline: { color: [color[0], color[1], color[2], 220], width: 2 }
          },
          attributes: attrs,
          popupTemplate: popupTpl
        }));
      }
    });

    console.log('[ATLAS] Added ' + alertLayer.graphics.length + ' alert graphics');
  }

  // --- Add NIFC Wildfire Graphics ---
  function addFires(fires) {
    if (!fireLayer) return;
    _allFires = fires;
    _renderFires();
  }

  function _renderFires() {
    if (!fireLayer) return;
    fireLayer.removeAll();

    var Graphic = ATLAS.map._Graphic;
    var fires = _hideContained
      ? _allFires.filter(function (f) { return f.percentContained == null || f.percentContained < 100; })
      : _allFires;

    fires.forEach(function (f) {
      if (!f.lat || !f.lon) return;

      // Size by acreage: small(<100), medium(<1000), large(<10000), major(10000+)
      var size = 6;
      var color = [249, 115, 22]; // orange
      if (f.acres >= 10000) {
        size = 20;
        color = [237, 27, 46]; // red — major fire
      } else if (f.acres >= 1000) {
        size = 14;
        color = [249, 80, 22];
      } else if (f.acres >= 100) {
        size = 10;
        color = [249, 115, 22];
      }

      var containedStr = f.percentContained != null ? f.percentContained + '%' : 'Unknown';
      var acresStr = f.acres ? f.acres.toLocaleString() : 'Unknown';
      var containedPct = f.percentContained != null ? f.percentContained : 0;
      var barColor = '#6b7280';
      if (f.percentContained != null) {
        if (f.percentContained >= 67) barColor = '#22c55e';
        else if (f.percentContained >= 34) barColor = '#f97316';
        else barColor = '#ef4444';
      }

      var discoveredStr = '';
      if (f.discoveredDate) {
        var dd = new Date(f.discoveredDate);
        discoveredStr = dd.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      }

      var costStr = '';
      if (f.costToDate && f.costToDate > 0) {
        costStr = f.costToDate >= 1000000
          ? '$' + (f.costToDate / 1000000).toFixed(1) + 'M'
          : '$' + (f.costToDate / 1000).toFixed(0) + 'K';
      }

      var behaviorBg = '#3a3633';
      var behaviorColor = '#a09890';
      if (f.fireBehavior) {
        var fb = f.fireBehavior.toLowerCase();
        if (fb.indexOf('extreme') >= 0) { behaviorBg = '#ef4444'; behaviorColor = '#fff'; }
        else if (fb.indexOf('active') >= 0) { behaviorBg = '#f97316'; behaviorColor = '#fff'; }
        else if (fb.indexOf('moderate') >= 0) { behaviorBg = '#eab308'; behaviorColor = '#1a1816'; }
        else if (fb.indexOf('minimal') >= 0) { behaviorBg = '#22c55e'; behaviorColor = '#fff'; }
      }

      var graphic = new Graphic({
        geometry: {
          type: 'point',
          longitude: f.lon,
          latitude: f.lat
        },
        symbol: {
          type: 'simple-marker',
          path: iconPaths.flame,
          color: color,
          size: size,
          outline: { color: [255, 255, 255, 200], width: 1 }
        },
        attributes: {
          name: f.name,
          state: f.state,
          county: f.county,
          acres: acresStr,
          contained: containedStr,
          containedPct: containedPct,
          barColor: barColor,
          personnel: f.personnel || 'N/A',
          discovered: discoveredStr || 'Unknown',
          behavior: f.fireBehavior || 'Unknown',
          behaviorBg: behaviorBg,
          behaviorColor: behaviorColor,
          complexity: f.complexity || '',
          cost: costStr || '',
          gacc: f.gacc || '',
          source: 'NIFC',
          lat: f.lat,
          lon: f.lon
        },
        popupTemplate: {
          title: '<span style="font-family:\'Libre Baskerville\',serif;">{name}</span>',
          content: '<div style="font-family:\'Source Sans Pro\',sans-serif;color:#f7f5f2;">' +
            '<div style="background:#ed1b2e;padding:6px 12px;margin:-12px -12px 0;font-family:\'IBM Plex Mono\',monospace;font-size:11px;letter-spacing:1px;text-transform:uppercase;color:#fff;">WILDFIRE</div>' +
            '<div style="padding:14px 0 8px;text-align:center;">' +
            '<div style="font-family:\'IBM Plex Mono\',monospace;font-size:28px;color:#ff6b4a;font-weight:700;line-height:1;">{acres}</div>' +
            '<div style="font-size:11px;color:#a09890;text-transform:uppercase;letter-spacing:1px;margin-top:4px;">Acres Burned</div></div>' +
            '<div style="padding:0 0 10px;">' +
            '<div style="font-size:11px;color:#a09890;margin-bottom:4px;">Containment: {contained}</div>' +
            '<div style="background:#3a3633;border-radius:4px;height:8px;overflow:hidden;">' +
            '<div style="background:{barColor};width:{containedPct}%;height:100%;border-radius:4px;"></div></div></div>' +
            '<table style="width:100%;border-collapse:collapse;font-size:13px;">' +
            '<tr style="background:rgba(255,255,255,0.04);"><td style="padding:6px 10px;color:#a09890;width:80px;">Location</td><td style="padding:6px 10px;">{county}, {state}</td></tr>' +
            '<tr><td style="padding:6px 10px;color:#a09890;">Discovered</td><td style="padding:6px 10px;">{discovered}</td></tr>' +
            '<tr style="background:rgba(255,255,255,0.04);"><td style="padding:6px 10px;color:#a09890;">Behavior</td><td style="padding:6px 10px;"><span style="display:inline-block;background:{behaviorBg};color:{behaviorColor};padding:2px 8px;border-radius:3px;font-size:11px;font-family:\'IBM Plex Mono\',monospace;">{behavior}</span></td></tr>' +
            '<tr><td style="padding:6px 10px;color:#a09890;">Personnel</td><td style="padding:6px 10px;">{personnel}</td></tr>' +
            '<tr style="background:rgba(255,255,255,0.04);"><td style="padding:6px 10px;color:#a09890;">GACC</td><td style="padding:6px 10px;">{gacc}</td></tr>' +
            '<tr><td style="padding:6px 10px;color:#a09890;">Complexity</td><td style="padding:6px 10px;">{complexity}</td></tr>' +
            '<tr style="background:rgba(255,255,255,0.04);"><td style="padding:6px 10px;color:#a09890;">Cost</td><td style="padding:6px 10px;font-family:\'IBM Plex Mono\',monospace;">{cost}</td></tr>' +
            '</table></div>'
        }
      });

      fireLayer.add(graphic);
    });

    console.log('[ATLAS] Added ' + fireLayer.graphics.length + ' fire graphics' + (_hideContained ? ' (hiding contained)' : ''));
  }

  function setFireFilter(hideContained) {
    _hideContained = hideContained;
    _renderFires();
    return _hideContained;
  }

  // --- Add USGS Earthquake Graphics ---
  function addEarthquakes(earthquakes) {
    if (!earthquakeLayer) return;
    earthquakeLayer.removeAll();

    var Graphic = ATLAS.map._Graphic;

    earthquakes.forEach(function (q) {
      if (!q.lat || !q.lon) return;

      // Size by magnitude
      var size = 14;
      var color = [167, 139, 250]; // light purple
      if (q.magnitude >= 7.0) {
        size = 30;
        color = [237, 27, 46]; // red
      } else if (q.magnitude >= 6.0) {
        size = 24;
        color = [220, 80, 200];
      } else if (q.magnitude >= 5.0) {
        size = 18;
        color = [167, 139, 250];
      }

      var timeStr = q.time ? new Date(q.time).toLocaleDateString() : 'Unknown';
      var pagerBg = '#3a3633', pagerColor = '#a09890';
      if (q.alert === 'green') { pagerBg = '#22c55e'; pagerColor = '#fff'; }
      else if (q.alert === 'yellow') { pagerBg = '#eab308'; pagerColor = '#1a1816'; }
      else if (q.alert === 'orange') { pagerBg = '#f97316'; pagerColor = '#fff'; }
      else if (q.alert === 'red') { pagerBg = '#ef4444'; pagerColor = '#fff'; }

      var graphic = new Graphic({
        geometry: {
          type: 'point',
          longitude: q.lon,
          latitude: q.lat
        },
        symbol: {
          type: 'simple-marker',
          path: iconPaths.seismic,
          color: color,
          size: size,
          outline: { color: [255, 255, 255, 200], width: 1 }
        },
        attributes: {
          magnitude: q.magnitude,
          place: q.place,
          time: timeStr,
          depth: q.depth ? q.depth.toFixed(1) + ' km' : 'Unknown',
          alert: q.alert || 'None',
          pagerBg: pagerBg,
          pagerColor: pagerColor,
          felt: q.felt ? q.felt.toLocaleString() + ' reports' : 'None',
          tsunami: q.tsunami ? 'Yes' : 'No',
          tsunamiBg: q.tsunami ? '#ef4444' : '#3a3633',
          tsunamiColor: q.tsunami ? '#fff' : '#a09890',
          usgsUrl: q.url || '',
          source: 'USGS',
          lat: q.lat,
          lon: q.lon
        },
        popupTemplate: {
          title: '<span style="font-family:\'Libre Baskerville\',serif;">M{magnitude} Earthquake</span>',
          content: '<div style="font-family:\'Source Sans Pro\',sans-serif;color:#f7f5f2;">' +
            '<div style="background:#7c3aed;padding:6px 12px;margin:-12px -12px 0;font-family:\'IBM Plex Mono\',monospace;font-size:11px;letter-spacing:1px;text-transform:uppercase;color:#fff;">SEISMIC EVENT</div>' +
            '<div style="padding:14px 0 8px;text-align:center;">' +
            '<div style="font-family:\'IBM Plex Mono\',monospace;font-size:32px;color:#a78bfa;font-weight:700;line-height:1;">M{magnitude}</div>' +
            '<div style="font-size:11px;color:#a09890;text-transform:uppercase;letter-spacing:1px;margin-top:4px;">Magnitude</div></div>' +
            '<table style="width:100%;border-collapse:collapse;font-size:13px;">' +
            '<tr style="background:rgba(255,255,255,0.04);"><td style="padding:6px 10px;color:#a09890;width:80px;">Location</td><td style="padding:6px 10px;">{place}</td></tr>' +
            '<tr><td style="padding:6px 10px;color:#a09890;">Date</td><td style="padding:6px 10px;">{time}</td></tr>' +
            '<tr style="background:rgba(255,255,255,0.04);"><td style="padding:6px 10px;color:#a09890;">Depth</td><td style="padding:6px 10px;font-family:\'IBM Plex Mono\',monospace;">{depth}</td></tr>' +
            '<tr><td style="padding:6px 10px;color:#a09890;">PAGER</td><td style="padding:6px 10px;"><span style="display:inline-block;background:{pagerBg};color:{pagerColor};padding:2px 8px;border-radius:3px;font-size:11px;font-family:\'IBM Plex Mono\',monospace;text-transform:uppercase;">{alert}</span></td></tr>' +
            '<tr style="background:rgba(255,255,255,0.04);"><td style="padding:6px 10px;color:#a09890;">Felt</td><td style="padding:6px 10px;">{felt}</td></tr>' +
            '<tr><td style="padding:6px 10px;color:#a09890;">Tsunami</td><td style="padding:6px 10px;"><span style="display:inline-block;background:{tsunamiBg};color:{tsunamiColor};padding:2px 8px;border-radius:3px;font-size:11px;font-family:\'IBM Plex Mono\',monospace;">{tsunami}</span></td></tr>' +
            '<tr style="background:rgba(255,255,255,0.04);"><td colspan="2" style="padding:8px 10px;text-align:center;"><a href="{usgsUrl}" target="_blank" rel="noopener" style="color:#a78bfa;text-decoration:none;font-family:\'IBM Plex Mono\',monospace;font-size:11px;letter-spacing:0.5px;">USGS Event Page ↗</a></td></tr>' +
            '</table></div>'
        }
      });

      earthquakeLayer.add(graphic);
    });

    console.log('[ATLAS] Added ' + earthquakeLayer.graphics.length + ' earthquake graphics');
  }

  // --- Zoom/Navigate ---
  function zoomTo(lat, lon, zoom) {
    if (!view) return;
    view.goTo({
      center: [lon, lat],
      zoom: zoom || 7
    }, { duration: 1500, easing: 'ease-in-out' });
  }

  function zoomToState(stateCode) {
    var coords = stateCoords[stateCode];
    if (coords) zoomTo(coords.lat, coords.lon, coords.zoom);
  }

  function zoomToRegion(region) {
    var regionExtents = {
      'Gulf Coast':    { center: [-89.0, 29.5], zoom: 5 },
      'Tornado Alley': { center: [-97.0, 36.0], zoom: 5 },
      'West Coast':    { center: [-120.0, 40.0], zoom: 5 },
      'Southeast':     { center: [-83.0, 33.0], zoom: 5 },
      'Northeast':     { center: [-73.0, 42.0], zoom: 6 },
      'Midwest':       { center: [-88.0, 41.0], zoom: 5 },
      'National':      { center: [-98.5, 39.8], zoom: 4 }
    };
    var ext = regionExtents[region] || regionExtents['National'];
    view.goTo({ center: ext.center, zoom: ext.zoom }, { duration: 1500, easing: 'ease-in-out' });
  }

  function zoomToNation() {
    if (!view) return;
    var Extent = ATLAS.map._Extent;
    view.goTo(new Extent({
      xmin: -125, ymin: 24,
      xmax: -66, ymax: 50,
      spatialReference: { wkid: 4326 }
    }), { duration: 1500, easing: 'ease-in-out' });
  }

  // Zoom to extent covering CONUS + AK + PR/VI (not Guam — too far)
  function zoomToQuakeExtent() {
    if (!view) return;
    var Extent = ATLAS.map._Extent;
    view.goTo(new Extent({
      xmin: -180, ymin: 15,   // SW: west of AK, south of PR
      xmax: -64,  ymax: 72,   // NE: east of VI, north of AK
      spatialReference: { wkid: 4326 }
    }), { duration: 1500, easing: 'ease-in-out' });
  }

  // --- Numbered Ranking Markers ---
  function showRankingMarkers(rankings) {
    if (!highlightLayer) return;
    highlightLayer.removeAll();

    var Graphic = ATLAS.map._Graphic;

    rankings.forEach(function (r) {
      if (!r.lat || !r.lon) return;

      var sevLabel = (r.severity || 'moderate').toUpperCase();
      var sevBg = '#6b7280';
      if (r.severity === 'critical') sevBg = '#ef4444';
      else if (r.severity === 'high') sevBg = '#f97316';
      else if (r.severity === 'moderate') sevBg = '#eab308';
      else if (r.severity === 'low') sevBg = '#22c55e';

      var popupContent = '<div style="font-family:\'Source Sans Pro\',sans-serif;color:#f7f5f2;">' +
        '<div style="background:' + sevBg + ';padding:6px 12px;margin:-12px -12px 12px;font-family:\'IBM Plex Mono\',monospace;font-size:11px;letter-spacing:1px;text-transform:uppercase;color:#fff;">RISK RANK #' + r.rank + ' — ' + sevLabel + '</div>' +
        '<div style="padding:8px 0;text-align:center;">' +
        '<div style="font-family:\'IBM Plex Mono\',monospace;font-size:32px;color:#ff6b4a;font-weight:700;line-height:1;">' + (r.score || '') + '</div>' +
        '<div style="font-size:11px;color:#a09890;text-transform:uppercase;letter-spacing:1px;margin-top:4px;">Risk Score</div></div>' +
        '<table style="width:100%;border-collapse:collapse;font-size:13px;">' +
        '<tr style="background:rgba(255,255,255,0.04);"><td style="padding:6px 10px;color:#a09890;width:80px;">Location</td><td style="padding:6px 10px;">' + (r.location || '') + ', ' + (r.state || '') + '</td></tr>' +
        '<tr><td style="padding:6px 10px;color:#a09890;">Factors</td><td style="padding:6px 10px;">' + (r.factors || '') + '</td></tr>' +
        '</table></div>';

      var popupTemplate = {
        title: '<span style="font-family:\'Libre Baskerville\',serif;">#' + r.rank + ' ' + (r.location || '') + '</span>',
        content: popupContent
      };

      // Red circle background — carries the popup
      highlightLayer.add(new Graphic({
        geometry: { type: 'point', longitude: r.lon, latitude: r.lat },
        symbol: {
          type: 'simple-marker',
          color: [237, 27, 46],
          size: 24,
          outline: { color: [255, 255, 255], width: 2 }
        },
        attributes: {
          rank: r.rank,
          location: r.location,
          state: r.state,
          score: r.score,
          severity: r.severity,
          factors: r.factors,
          source: 'ranking',
          lat: r.lat,
          lon: r.lon
        },
        popupTemplate: popupTemplate
      }));

      // White number label
      highlightLayer.add(new Graphic({
        geometry: { type: 'point', longitude: r.lon, latitude: r.lat },
        symbol: {
          type: 'text',
          text: String(r.rank),
          color: [255, 255, 255],
          font: { size: 11, weight: 'bold', family: 'Source Sans Pro' },
          yoffset: 0
        }
      }));
    });
  }

  // Legacy — single location highlight (for ranking click)
  function highlightLocations(locations) {
    if (!highlightLayer) return;
    highlightLayer.removeAll();

    var Graphic = ATLAS.map._Graphic;
    locations.forEach(function (loc) {
      if (!loc.lat || !loc.lon) return;
      highlightLayer.add(new Graphic({
        geometry: { type: 'point', longitude: loc.lon, latitude: loc.lat },
        symbol: {
          type: 'simple-marker',
          color: [237, 27, 46],
          size: 24,
          outline: { color: [255, 255, 255], width: 2.5 }
        }
      }));
    });
  }

  function clearHighlights() {
    if (highlightLayer) highlightLayer.removeAll();
  }

  // --- SVI Layer Toggle ---
  function showSVI(visible) {
    if (sviLayer) sviLayer.visible = visible;
  }

  // --- Layer Toggles ---
  function toggleLayer(name) {
    var layers = {
      radar: radarLayer,
      qpf: qpfLayer,
      wwa: wwaLayer,
      svi: sviLayer,
      spc: spcLayer,
      nhc: nhcLayer,
      ero: eroLayer,
      disasters: disasterLayer,
      alerts: alertLayer,
      fires: fireLayer,
      quakes: earthquakeLayer
    };
    var layer = layers[name];
    if (layer) {
      layer.visible = !layer.visible;
      // CIG rides with SPC toggle
      if (name === 'spc' && cigLayer) cigLayer.visible = layer.visible;
      console.log('[ATLAS] ' + name + ' layer: ' + (layer.visible ? 'ON' : 'OFF'));
      updateLegendVisibility();
      return layer.visible;
    }
    return false;
  }

  function isLayerVisible(name) {
    var layers = { radar: radarLayer, qpf: qpfLayer, wwa: wwaLayer, svi: sviLayer, spc: spcLayer, nhc: nhcLayer, ero: eroLayer, disasters: disasterLayer, alerts: alertLayer, fires: fireLayer, quakes: earthquakeLayer };
    var layer = layers[name];
    return layer ? layer.visible : false;
  }

  // --- Legend config (single source of truth for icons + colors + labels) ---
  const legendConfig = [
    { layer: 'disasters', label: 'FEMA Disasters', path: iconPaths.shield, color: '#3b82f6' },
    { layer: 'fires', label: 'Active Wildfires', path: iconPaths.flame, color: '#f97316' },
    { layer: 'quakes', label: 'Earthquakes', path: iconPaths.seismic, color: '#a78bfa' },
    { layer: 'wwa', label: 'Watches/Warnings', color: '#ef4444', shape: 'rect' }
  ];

  function buildLegend() {
    var container = document.getElementById('legend-items');
    if (!container) return;
    container.innerHTML = '';

    legendConfig.forEach(function (item) {
      var div = document.createElement('div');
      div.className = 'legend-item';
      div.dataset.layer = item.layer;

      var svg;
      if (item.path) {
        svg = '<svg width="16" height="16" viewBox="0 0 24 24"><path d="' + item.path + '" fill="' + item.color + '" stroke="#fff" stroke-width="1"/></svg>';
      } else {
        svg = '<svg width="16" height="16" viewBox="0 0 24 24"><rect x="2" y="2" width="20" height="20" rx="3" fill="' + item.color + '" stroke="#fff" stroke-width="1" opacity="0.6"/></svg>';
      }

      div.innerHTML = svg + '<span>' + item.label + '</span>';
      container.appendChild(div);
    });
  }

  function updateLegendVisibility() {
    var items = document.querySelectorAll('.legend-item');
    items.forEach(function (item) {
      var layerName = item.dataset.layer;
      item.classList.toggle('hidden', !isLayerVisible(layerName));
    });
  }

  // --- Screenshot for PDF export ---
  function takeScreenshot() {
    if (!view) return Promise.resolve(null);
    return view.takeScreenshot({ format: 'png', quality: 90 });
  }

  // --- Execute AI Map Commands ---
  function executeMapCommands(commands) {
    if (!commands || !Array.isArray(commands)) return;

    commands.forEach(function (cmd) {
      if (cmd.type === 'zoom' && cmd.target) {
        zoomTo(cmd.target.lat, cmd.target.lon, cmd.target.zoom);
      } else if (cmd.type === 'highlight' && cmd.target) {
        highlightLocations([cmd.target]);
      }
    });
  }

  function setViewPadding(padding) {
    if (view) view.padding = padding;
  }

  function zoomIn() {
    if (view) view.zoom += 1;
  }

  function zoomOut() {
    if (view) view.zoom -= 1;
  }

  // --- Render SPC outlook + probability polygons from live GeoJSON ---
  function hexToRgba(hex, alpha) {
    hex = hex.replace('#', '');
    var r = parseInt(hex.substring(0, 2), 16);
    var g = parseInt(hex.substring(2, 4), 16);
    var b = parseInt(hex.substring(4, 6), 16);
    return [r, g, b, alpha !== undefined ? alpha : 0.5];
  }

  function hexToRgb(hex) {
    hex = hex.replace('#', '');
    return [parseInt(hex.substring(0, 2), 16), parseInt(hex.substring(2, 4), 16), parseInt(hex.substring(4, 6), 16)];
  }

  function renderSPC(outlookData, intensityData) {
    if (!spcLayer) return;
    var Graphic = ATLAS.map._Graphic;
    spcLayer.removeAll();

    // Render probabilistic layers first (underneath)
    (intensityData || []).forEach(function (item) {
      if (!item.geometry || !item.geometry.coordinates) return;
      var fill = item.fill ? hexToRgba(item.fill, 0.35) : [150, 150, 150, 0.3];
      var stroke = item.stroke ? hexToRgb(item.stroke) : [150, 150, 150];
      var rings = item.geometry.type === 'MultiPolygon'
        ? item.geometry.coordinates.reduce(function (acc, poly) { return acc.concat(poly); }, [])
        : item.geometry.coordinates;
      spcLayer.add(new Graphic({
        geometry: { type: 'polygon', rings: rings },
        symbol: { type: 'simple-fill', color: fill, outline: { color: stroke, width: 1 } },
        attributes: { hazard: item.hazard, label: item.label2 || item.label, source: item.source },
        popupTemplate: {
          title: '{source}',
          content: '<b>' + (item.label2 || item.label) + '</b><br>Issued: ' + (item.issue || '') + '<br>Forecaster: ' + (item.forecaster || '')
        }
      }));
    });

    // Render categorical on top
    (outlookData || []).forEach(function (item) {
      if (!item.geometry || !item.geometry.coordinates) return;
      var fill = item.fill ? hexToRgba(item.fill, 0.4) : [150, 150, 150, 0.3];
      var stroke = item.stroke ? hexToRgb(item.stroke) : [150, 150, 150];
      var rings = item.geometry.type === 'MultiPolygon'
        ? item.geometry.coordinates.reduce(function (acc, poly) { return acc.concat(poly); }, [])
        : item.geometry.coordinates;
      spcLayer.add(new Graphic({
        geometry: { type: 'polygon', rings: rings },
        symbol: { type: 'simple-fill', color: fill, outline: { color: stroke, width: 1.5 } },
        attributes: { risk: item.riskLevel, label: item.riskLabel, source: item.source },
        popupTemplate: {
          title: 'SPC Day 1 Outlook — {label}',
          content: '<b>Risk:</b> ' + (item.riskLabel || item.riskLevel) + '<br><b>Issued:</b> ' + (item.issue || '') + '<br><b>Forecaster:</b> ' + (item.forecaster || '')
        }
      }));
    });

    console.log('[ATLAS] Rendered SPC: ' + (outlookData || []).length + ' categorical + ' + (intensityData || []).length + ' probabilistic polygons');
  }

  // --- Render CIG polygons from live SPC GeoJSON ---
  var cigColors = {
    tornado: { 1: [255, 200, 0, 0.3], 2: [255, 120, 0, 0.4], 3: [220, 30, 30, 0.5] },
    wind:    { 1: [100, 180, 255, 0.3], 2: [60, 120, 255, 0.4], 3: [30, 60, 200, 0.5] },
    hail:    { 1: [0, 200, 120, 0.3], 2: [0, 160, 80, 0.4], 3: [0, 120, 60, 0.5] }
  };
  var cigOutlines = { tornado: [255, 160, 0], wind: [80, 140, 255], hail: [0, 180, 100] };

  function renderCIG(cigData) {
    if (!cigLayer) return;
    var Graphic = ATLAS.map._Graphic;
    cigLayer.removeAll();
    if (!cigData || cigData.length === 0) return;
    cigData.forEach(function (item) {
      if (!item.geometry || !item.geometry.coordinates) return;
      var dn = parseInt(item.level.replace('CIG', '')) || 1;
      var fill = (cigColors[item.hazard] || cigColors.wind)[dn] || [150, 150, 150, 0.3];
      var outline = cigOutlines[item.hazard] || [150, 150, 150];
      var rings = item.geometry.type === 'MultiPolygon'
        ? item.geometry.coordinates.reduce(function (acc, poly) { return acc.concat(poly); }, [])
        : item.geometry.coordinates;
      var graphic = new Graphic({
        geometry: { type: 'polygon', rings: rings },
        symbol: {
          type: 'simple-fill',
          color: fill,
          outline: { color: outline, width: 1.5 }
        },
        attributes: { hazard: item.hazard, level: item.level, label: item.label, source: item.source },
        popupTemplate: {
          title: 'SPC Conditional Intensity — ' + item.hazard.charAt(0).toUpperCase() + item.hazard.slice(1),
          content: '<b>Level:</b> ' + item.level + '<br><b>Detail:</b> ' + (item.label || item.label2 || 'Active') +
            '<br><b>Valid:</b> ' + (item.valid || '') + ' — ' + (item.expire || '') +
            '<br><b>Forecaster:</b> ' + (item.forecaster || '')
        }
      });
      cigLayer.add(graphic);
    });
    // Match SPC visibility
    cigLayer.visible = spcLayer ? spcLayer.visible : false;
    console.log('[ATLAS] Rendered ' + cigData.length + ' CIG polygons on map');
  }

  return {
    init: init,
    addDisasters: addDisasters,
    addAlerts: addAlerts,
    addFires: addFires,
    addEarthquakes: addEarthquakes,
    zoomTo: zoomTo,
    zoomToState: zoomToState,
    zoomToRegion: zoomToRegion,
    zoomToNation: zoomToNation,
    zoomToQuakeExtent: zoomToQuakeExtent,
    setViewPadding: setViewPadding,
    zoomIn: zoomIn,
    zoomOut: zoomOut,
    highlightLocations: highlightLocations,
    showRankingMarkers: showRankingMarkers,
    clearHighlights: clearHighlights,
    showSVI: showSVI,
    toggleLayer: toggleLayer,
    isLayerVisible: isLayerVisible,
    executeMapCommands: executeMapCommands,
    setFireFilter: setFireFilter,
    renderSPC: renderSPC,
    renderCIG: renderCIG,
    takeScreenshot: takeScreenshot,
    updateLegendVisibility: updateLegendVisibility,
    stateCoords: stateCoords
  };

})();

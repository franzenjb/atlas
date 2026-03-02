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
  let nhcLayer = null;
  let eroLayer = null;
  let pulseOverlays = [];

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
          visible: true,
          opacity: 0.5,
          sublayers: [{ id: 1 }]
        });

        // SPC Convective Outlook — tornado/severe risk areas
        spcLayer = new MapImageLayer({
          url: 'https://mapservices.weather.noaa.gov/vector/rest/services/outlooks/SPC_wx_outlks/MapServer',
          title: 'SPC Convective Outlook',
          visible: false,
          opacity: 0.5,
          sublayers: [{ id: 1 }] // Day 1 categorical
        });

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
          layers: [sviLayer, radarLayer, qpfLayer, wwaLayer, spcLayer, nhcLayer, eroLayer, alertLayer, disasterLayer, fireLayer, earthquakeLayer, highlightLayer]
        });

        view = new MapView({
          container: 'viewDiv',
          map: map,
          center: [-98.5, 39.8],
          zoom: 4,
          ui: { components: ['zoom', 'attribution'] },
          popup: { autoOpenEnabled: true, dockEnabled: false },
          constraints: { minZoom: 3 }
        });

        // Store module references for graphic creation
        ATLAS.map._Graphic = Graphic;
        ATLAS.map._Extent = Extent;

        view.when(function () {
          // Remove loading scrim
          var scrim = document.getElementById('map-scrim');
          if (scrim) {
            scrim.loading = false;
            setTimeout(function () { scrim.style.display = 'none'; }, 300);
          }
          console.log('[ATLAS] Map ready');
          resolve(view);
        });

        // Click handler for disaster points
        view.on('click', function (event) {
          view.hitTest(event).then(function (response) {
            var result = response.results.find(function (r) {
              return r.graphic.layer === disasterLayer || r.graphic.layer === alertLayer || r.graphic.layer === fireLayer || r.graphic.layer === earthquakeLayer;
            });
            if (result && result.graphic.attributes) {
              var attrs = result.graphic.attributes;
              if (attrs.lat && attrs.lon) {
                zoomTo(attrs.lat, attrs.lon, 8);
              }
              // Dispatch event for app.js to handle
              document.dispatchEvent(new CustomEvent('atlas-feature-click', { detail: attrs }));
            }
          });
        });
      });
    });
  }

  // --- Add FEMA Disaster Graphics ---
  function addDisasters(disasters) {
    if (!disasterLayer) return;
    disasterLayer.removeAll();

    var Graphic = ATLAS.map._Graphic;

    // Group by disaster number to get unique disasters, pick representative location
    var unique = {};
    disasters.forEach(function (d) {
      if (!unique[d.id]) unique[d.id] = d;
    });

    // We need geocoded locations — use state centroids as fallback
    Object.values(unique).forEach(function (d) {
      var coords = stateCoords[d.state] || stateCoords[d.stateCode];
      if (!coords) return;

      var color = disasterColors[d.type] || disasterColors.default;
      var isFire = d.type === 'Fire';
      var declType = d.declarationType === 'EM' ? 'Emergency' : 'Major Disaster';
      var dateStr = d.declarationDate ? d.declarationDate.split('T')[0] : '';

      var graphic = new Graphic({
        geometry: {
          type: 'point',
          longitude: coords.lon + (Math.random() - 0.5) * 2,
          latitude: coords.lat + (Math.random() - 0.5) * 1
        },
        symbol: {
          type: 'simple-marker',
          style: isFire ? 'diamond' : 'circle',
          color: color,
          size: isFire ? 14 : 10,
          outline: { color: [255, 255, 255, 180], width: 1.5 }
        },
        attributes: {
          id: d.id,
          title: d.title,
          type: d.type,
          state: d.state,
          date: dateStr,
          declType: declType,
          programs: d.programsActive ? d.programsActive.join(', ') : '',
          source: 'FEMA',
          lat: coords.lat,
          lon: coords.lon
        },
        popupTemplate: {
          title: '<span style="font-family:\'Libre Baskerville\',serif;">{title}</span>',
          content: '<div style="font-family:\'Source Sans Pro\',sans-serif;">' +
            '<div style="background:rgba(237,27,46,0.15);padding:6px 8px;border-radius:3px;margin-bottom:8px;font-size:12px;color:#ff6b7a;font-family:\'IBM Plex Mono\',monospace;letter-spacing:0.5px;">FEDERAL {declType} DECLARATION</div>' +
            '<b>Type:</b> {type}<br>' +
            '<b>State:</b> {state}<br>' +
            '<b>Declared:</b> {date}<br>' +
            '<b>Programs:</b> {programs}<br>' +
            '<b>Disaster #:</b> <span style="font-family:\'IBM Plex Mono\',monospace;">DR-{id}</span>' +
            '</div>'
        }
      });

      disasterLayer.add(graphic);
    });

    console.log('[ATLAS] Added ' + Object.keys(unique).length + ' disaster graphics');
  }

  // --- Add NWS Alert Graphics ---
  function addAlerts(alerts) {
    if (!alertLayer) return;
    alertLayer.removeAll();

    var Graphic = ATLAS.map._Graphic;

    alerts.forEach(function (a) {
      // Add polygon if geometry available
      if (a.geometry && a.geometry.type === 'Polygon') {
        var color = severityColors[a.severity] || severityColors.Unknown;

        var graphic = new Graphic({
          geometry: {
            type: 'polygon',
            rings: a.geometry.coordinates
          },
          symbol: {
            type: 'simple-fill',
            color: [color[0], color[1], color[2], 40],
            outline: { color: [color[0], color[1], color[2], 180], width: 1.5 }
          },
          attributes: {
            event: a.event,
            severity: a.severity,
            headline: a.headline,
            areas: a.areas,
            expires: a.expires,
            source: 'NWS',
            lat: a.lat,
            lon: a.lon
          },
          popupTemplate: {
            title: '<span style="font-family:\'Libre Baskerville\',serif;">{event}</span>',
            content: '<div style="font-family:\'Source Sans Pro\',sans-serif;">' +
              '<b>Severity:</b> {severity}<br>' +
              '<b>Areas:</b> {areas}<br>' +
              '<b>Expires:</b> {expires}' +
              '</div>'
          }
        });

        alertLayer.add(graphic);
      }
    });

    console.log('[ATLAS] Added ' + alertLayer.graphics.length + ' alert graphics');
  }

  // --- Add NIFC Wildfire Graphics ---
  function addFires(fires) {
    if (!fireLayer) return;
    fireLayer.removeAll();

    var Graphic = ATLAS.map._Graphic;

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

      var graphic = new Graphic({
        geometry: {
          type: 'point',
          longitude: f.lon,
          latitude: f.lat
        },
        symbol: {
          type: 'simple-marker',
          style: 'diamond',
          color: color,
          size: size,
          outline: { color: [255, 255, 255, 200], width: 1.5 }
        },
        attributes: {
          name: f.name,
          state: f.state,
          county: f.county,
          acres: acresStr,
          contained: containedStr,
          personnel: f.personnel || 'N/A',
          source: 'NIFC',
          lat: f.lat,
          lon: f.lon
        },
        popupTemplate: {
          title: '<span style="font-family:\'Libre Baskerville\',serif;">{name}</span>',
          content: '<div style="font-family:\'Source Sans Pro\',sans-serif;">' +
            '<b>Type:</b> Wildfire<br>' +
            '<b>Location:</b> {county}, {state}<br>' +
            '<b>Acres:</b> <span style="font-family:\'IBM Plex Mono\',monospace;">{acres}</span><br>' +
            '<b>Contained:</b> <span style="font-family:\'IBM Plex Mono\',monospace;">{contained}</span><br>' +
            '<b>Personnel:</b> {personnel}' +
            '</div>'
        }
      });

      fireLayer.add(graphic);
    });

    console.log('[ATLAS] Added ' + fireLayer.graphics.length + ' fire graphics');
  }

  // --- Add USGS Earthquake Graphics ---
  function addEarthquakes(earthquakes) {
    if (!earthquakeLayer) return;
    earthquakeLayer.removeAll();

    var Graphic = ATLAS.map._Graphic;

    earthquakes.forEach(function (q) {
      if (!q.lat || !q.lon) return;

      // Size by magnitude
      var size = 8;
      var color = [139, 92, 246]; // purple
      if (q.magnitude >= 7.0) {
        size = 24;
        color = [237, 27, 46]; // red
      } else if (q.magnitude >= 6.0) {
        size = 18;
        color = [200, 60, 180];
      } else if (q.magnitude >= 5.0) {
        size = 13;
        color = [160, 80, 220];
      }

      var timeStr = q.time ? new Date(q.time).toLocaleDateString() : 'Unknown';

      var graphic = new Graphic({
        geometry: {
          type: 'point',
          longitude: q.lon,
          latitude: q.lat
        },
        symbol: {
          type: 'simple-marker',
          style: 'cross',
          color: color,
          size: size,
          outline: { color: [255, 255, 255, 200], width: 2 }
        },
        attributes: {
          magnitude: q.magnitude,
          place: q.place,
          time: timeStr,
          depth: q.depth ? q.depth.toFixed(1) + ' km' : 'Unknown',
          alert: q.alert || 'None',
          source: 'USGS',
          lat: q.lat,
          lon: q.lon
        },
        popupTemplate: {
          title: '<span style="font-family:\'Libre Baskerville\',serif;">M{magnitude} Earthquake</span>',
          content: '<div style="font-family:\'Source Sans Pro\',sans-serif;">' +
            '<b>Location:</b> {place}<br>' +
            '<b>Magnitude:</b> <span style="font-family:\'IBM Plex Mono\',monospace;">{magnitude}</span><br>' +
            '<b>Date:</b> {time}<br>' +
            '<b>Depth:</b> <span style="font-family:\'IBM Plex Mono\',monospace;">{depth}</span><br>' +
            '<b>PAGER Alert:</b> {alert}' +
            '</div>'
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
    view.goTo({ center: [-98.5, 39.8], zoom: 4 }, { duration: 1500, easing: 'ease-in-out' });
  }

  // --- Highlight Locations ---
  function highlightLocations(locations) {
    if (!highlightLayer) return;
    highlightLayer.removeAll();

    var Graphic = ATLAS.map._Graphic;

    locations.forEach(function (loc) {
      if (!loc.lat || !loc.lon) return;

      // Outer ring (highlight)
      highlightLayer.add(new Graphic({
        geometry: { type: 'point', longitude: loc.lon, latitude: loc.lat },
        symbol: {
          type: 'simple-marker',
          color: [0, 0, 0, 0],
          size: 28,
          outline: { color: [237, 27, 46, 200], width: 3 }
        }
      }));

      // Inner dot
      highlightLayer.add(new Graphic({
        geometry: { type: 'point', longitude: loc.lon, latitude: loc.lat },
        symbol: {
          type: 'simple-marker',
          color: [237, 27, 46],
          size: 8,
          outline: { color: [255, 255, 255], width: 2 }
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
      console.log('[ATLAS] ' + name + ' layer: ' + (layer.visible ? 'ON' : 'OFF'));
      return layer.visible;
    }
    return false;
  }

  function isLayerVisible(name) {
    var layers = { radar: radarLayer, qpf: qpfLayer, wwa: wwaLayer, svi: sviLayer, spc: spcLayer, nhc: nhcLayer, ero: eroLayer, disasters: disasterLayer, alerts: alertLayer, fires: fireLayer, quakes: earthquakeLayer };
    var layer = layers[name];
    return layer ? layer.visible : false;
  }

  // --- Execute AI Map Commands ---
  function executeMapCommands(commands) {
    if (!commands || !Array.isArray(commands)) return;

    commands.forEach(function (cmd) {
      if (cmd.type === 'zoom' && cmd.target) {
        zoomTo(cmd.target.lat, cmd.target.lon, cmd.target.zoom);
      } else if (cmd.type === 'highlight' && cmd.target) {
        highlightLocations([cmd.target]);
      } else if (cmd.type === 'overlay') {
        showSVI(true);
      }
    });
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
    highlightLocations: highlightLocations,
    clearHighlights: clearHighlights,
    showSVI: showSVI,
    toggleLayer: toggleLayer,
    isLayerVisible: isLayerVisible,
    executeMapCommands: executeMapCommands,
    stateCoords: stateCoords
  };

})();

const Anthropic = require('@anthropic-ai/sdk');
const { put } = require('@vercel/blob');

const BLOB_KEY = 'atlas-briefing.json';

// Data fetchers (server-side versions of client data.js)
async function fetchFEMA() {
  try {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 120);
    const res = await fetch('https://www.fema.gov/api/open/v2/DisasterDeclarationsSummaries?$orderby=declarationDate%20desc&$top=200');
    if (!res.ok) return [];
    const data = await res.json();
    const records = data.DisasterDeclarationsSummaries || [];
    return records.filter(d => new Date(d.declarationDate) >= cutoff).map(d => ({
      id: d.disasterNumber,
      title: d.declarationTitle,
      type: d.incidentType,
      state: d.state,
      declarationDate: d.declarationDate,
      declarationType: d.declarationType
    }));
  } catch (err) {
    console.error('[CRON] FEMA error:', err.message);
    return [];
  }
}

async function fetchNWS() {
  try {
    const res = await fetch('https://api.weather.gov/alerts/active?status=actual&message_type=alert', {
      headers: { 'User-Agent': 'ATLAS/1.0 (disaster-intelligence)' }
    });
    if (!res.ok) return [];
    const data = await res.json();
    const severityOrder = { Extreme: 4, Severe: 3, Moderate: 2, Minor: 1, Unknown: 0 };
    return (data.features || [])
      .filter(f => severityOrder[f.properties.severity] >= 2)
      .map(f => ({
        event: f.properties.event,
        severity: f.properties.severity,
        areas: (f.properties.areaDesc || '').substring(0, 200),
        onset: f.properties.onset,
        expires: f.properties.expires
      }))
      .sort((a, b) => (severityOrder[b.severity] || 0) - (severityOrder[a.severity] || 0))
      .slice(0, 40);
  } catch (err) {
    console.error('[CRON] NWS error:', err.message);
    return [];
  }
}

async function fetchNIFC() {
  try {
    const url = 'https://services3.arcgis.com/T4QMspbfLg3qTGWY/arcgis/rest/services/WFIGS_Incident_Locations_Current/FeatureServer/0/query' +
      '?where=IncidentTypeCategory%3D%27WF%27%20AND%20ActiveFireCandidate%3D1' +
      '&outFields=IncidentName,POOState,POOCounty,IncidentSize,PercentContained,TotalIncidentPersonnel,FireBehaviorGeneral,GACC' +
      '&orderByFields=IncidentSize+DESC&resultRecordCount=50&returnGeometry=true&f=json';
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = await res.json();
    return (data.features || []).map(f => ({
      name: f.attributes.IncidentName,
      state: (f.attributes.POOState || '').replace('US-', ''),
      county: f.attributes.POOCounty,
      acres: f.attributes.IncidentSize || 0,
      percentContained: f.attributes.PercentContained,
      personnel: f.attributes.TotalIncidentPersonnel,
      fireBehavior: f.attributes.FireBehaviorGeneral,
      gacc: f.attributes.GACC,
      lat: f.geometry ? f.geometry.y : null,
      lon: f.geometry ? f.geometry.x : null
    }));
  } catch (err) {
    console.error('[CRON] NIFC error:', err.message);
    return [];
  }
}

async function fetchUSGS() {
  try {
    const res = await fetch('https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_month.geojson');
    if (!res.ok) return [];
    const data = await res.json();
    return (data.features || []).map(f => ({
      magnitude: f.properties.mag,
      place: f.properties.place,
      time: new Date(f.properties.time).toISOString(),
      alert: f.properties.alert,
      lat: f.geometry.coordinates[1],
      lon: f.geometry.coordinates[0],
      depth: f.geometry.coordinates[2]
    })).sort((a, b) => b.magnitude - a.magnitude).slice(0, 20);
  } catch (err) {
    console.error('[CRON] USGS error:', err.message);
    return [];
  }
}

async function fetchBreakingNews() {
  if (!process.env.CURRENTS_API_KEY) return [];
  try {
    const keywords = 'mass shooting OR active shooter OR building collapse OR explosion OR industrial accident OR train derailment OR plane crash OR chemical spill OR mass casualty OR dam failure OR bridge collapse OR pipeline explosion';
    const url = `https://api.currentsapi.services/v1/search?keywords=${encodeURIComponent(keywords)}&language=en&country=US&type=1&apiKey=${process.env.CURRENTS_API_KEY}`;
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = await res.json();
    const cutoff = new Date();
    cutoff.setHours(cutoff.getHours() - 24);
    return (data.news || [])
      .filter(n => new Date(n.published) >= cutoff)
      .slice(0, 10)
      .map(n => ({
        title: n.title,
        description: (n.description || '').substring(0, 200),
        source: n.author || 'Unknown',
        publishedAt: n.published,
        url: n.url
      }));
  } catch (err) {
    console.error('[CRON] News error:', err.message);
    return [];
  }
}

async function fetchSPCOutlook() {
  try {
    const res = await fetch('https://www.spc.noaa.gov/products/outlook/day1otlk_cat.nolyr.geojson');
    if (!res.ok) return [];
    const data = await res.json();
    return (data.features || []).filter(f => f.properties && f.properties.DN > 0).map(f => ({
      riskLevel: f.properties.LABEL || '',
      riskLabel: f.properties.LABEL2 || '',
      category: f.properties.DN,
      issue: f.properties.ISSUE || '',
      forecaster: f.properties.FORECASTER || '',
      source: 'SPC Day 1 Convective Outlook'
    }));
  } catch (err) {
    console.error('[CRON] SPC error:', err.message);
    return [];
  }
}

async function fetchSPCIntensity() {
  const feeds = [
    { type: 'tornado', url: 'https://www.spc.noaa.gov/products/outlook/day1otlk_torn.nolyr.geojson' },
    { type: 'wind', url: 'https://www.spc.noaa.gov/products/outlook/day1otlk_wind.nolyr.geojson' },
    { type: 'hail', url: 'https://www.spc.noaa.gov/products/outlook/day1otlk_hail.nolyr.geojson' }
  ];
  const results = [];
  for (const feed of feeds) {
    try {
      const res = await fetch(feed.url);
      if (!res.ok) continue;
      const data = await res.json();
      (data.features || []).filter(f => f.properties && f.properties.DN > 0).forEach(f => {
        results.push({
          hazard: feed.type,
          type: 'probabilistic',
          label: f.properties.LABEL || '',
          label2: f.properties.LABEL2 || '',
          category: f.properties.DN
        });
      });
    } catch (err) {
      console.warn('[CRON] SPC ' + feed.type + ' error:', err.message);
    }
  }
  return results;
}

async function fetchSPCCIG() {
  const feeds = [
    { type: 'tornado', url: 'https://www.spc.noaa.gov/products/outlook/day1otlk_cigtorn.nolyr.geojson' },
    { type: 'wind', url: 'https://www.spc.noaa.gov/products/outlook/day1otlk_cigwind.nolyr.geojson' },
    { type: 'hail', url: 'https://www.spc.noaa.gov/products/outlook/day1otlk_cighail.nolyr.geojson' }
  ];
  const results = [];
  for (const feed of feeds) {
    try {
      const res = await fetch(feed.url);
      if (!res.ok) continue;
      const data = await res.json();
      (data.features || []).filter(f => f.properties && f.properties.DN > 0).forEach(f => {
        results.push({ hazard: feed.type, level: 'CIG' + f.properties.DN, label: f.properties.LABEL2 || f.properties.LABEL || '' });
      });
    } catch (err) { console.warn('[CRON] CIG ' + feed.type + ':', err.message); }
  }
  return results;
}

async function fetchNHCOutlook() {
  try {
    const url = 'https://mapservices.weather.noaa.gov/tropical/rest/services/tropical/NHC_tropical_weather/MapServer/0/query' +
      '?where=1%3D1&outFields=*&f=json&returnGeometry=false&resultRecordCount=10';
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = await res.json();
    return (data.features || []).map(f => ({
      name: f.attributes.STORMNAME || f.attributes.NAME || 'Unnamed',
      type: f.attributes.STORMTYPE || f.attributes.TYPE || 'Unknown',
      windSpeed: f.attributes.MAXWIND || f.attributes.INTENSITY,
      movement: f.attributes.MOVEMENT || f.attributes.MVMT,
      source: 'NHC Tropical Outlook'
    }));
  } catch (err) {
    console.error('[CRON] NHC error:', err.message);
    return [];
  }
}

async function fetchEROOutlook() {
  try {
    const url = 'https://mapservices.weather.noaa.gov/vector/rest/services/hazards/wpc_precip_hazards/MapServer/0/query' +
      '?where=1%3D1&outFields=LABEL,LABEL2,stroke,fill,dn,idp_source&f=json&returnGeometry=false';
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = await res.json();
    return (data.features || []).map(f => ({
      riskLevel: f.attributes.LABEL || f.attributes.LABEL2,
      category: f.attributes.dn,
      source: 'WPC Day 1 Excessive Rainfall Outlook'
    }));
  } catch (err) {
    console.error('[CRON] ERO error:', err.message);
    return [];
  }
}

module.exports = async function handler(req, res) {
  // Verify cron secret
  const secret = req.query.secret || req.headers['x-cron-secret'];
  if (secret !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    console.log('[CRON] Starting briefing generation...');

    // Fetch all data in parallel
    const [disasters, alerts, fires, earthquakes, news, spc, spcIntensity, nhc, ero] = await Promise.all([
      fetchFEMA(), fetchNWS(), fetchNIFC(), fetchUSGS(),
      fetchBreakingNews(), fetchSPCOutlook(), fetchSPCIntensity(), fetchNHCOutlook(), fetchEROOutlook()
    ]);

    // CIG from live SPC GeoJSON
    const spcCIG = await fetchSPCCIG();

    console.log(`[CRON] Data: ${disasters.length} disasters, ${alerts.length} alerts, ${fires.length} fires, ${earthquakes.length} quakes, ${news.length} news, ${spc.length} SPC, ${spcIntensity.length} SPC intensity, ${nhc.length} NHC, ${ero.length} ERO`);

    // Deduplicate disasters
    const uniqueDisasters = {};
    disasters.forEach(d => {
      if (!uniqueDisasters[d.id]) uniqueDisasters[d.id] = { ...d, count: 1 };
      else uniqueDisasters[d.id].count++;
    });

    // Build AI context
    let dataContext = '';
    dataContext += `\n\nACTIVE FEMA DISASTER DECLARATIONS (${disasters.length} total, ${Object.keys(uniqueDisasters).length} unique):\n`;
    dataContext += JSON.stringify(Object.values(uniqueDisasters).slice(0, 30));
    dataContext += `\n\nACTIVE NWS WEATHER ALERTS (${alerts.length} total):\n`;
    dataContext += JSON.stringify(alerts.slice(0, 30));
    dataContext += `\n\nACTIVE WILDFIRES (${fires.length} total):\n`;
    dataContext += JSON.stringify(fires.slice(0, 30));
    dataContext += `\n\nRECENT EARTHQUAKES M4.5+ (${earthquakes.length} in last 30 days):\n`;
    dataContext += JSON.stringify(earthquakes.slice(0, 15));
    if (news.length > 0) {
      dataContext += `\n\nBREAKING NEWS / MASS CASUALTY EVENTS (${news.length} in last 24h):\n`;
      dataContext += JSON.stringify(news);
    }
    if (spc.length > 0) {
      dataContext += `\n\nSPC CONVECTIVE OUTLOOK — "How likely?" (categorical risk level):\n`;
      dataContext += JSON.stringify(spc);
    }
    if (spcIntensity.length > 0) {
      dataContext += `\n\nSPC HAZARD INTENSITY — "How bad could it be?" (tornado/wind/hail probabilities + significant markers):\n`;
      dataContext += `Significant tornado = potential EF2+. Significant hail = potential 2"+. Significant wind = potential 75mph+ gusts.\n`;
      dataContext += JSON.stringify(spcIntensity);
    }
    if (spc.length > 0 || spcIntensity.length > 0) {
      dataContext += `\n\nSPC CONDITIONAL INTENSITY GUIDANCE (CIG) REFERENCE — Describes expected severity IF an event occurs:\n`;
      dataContext += JSON.stringify(spcCIG);
    }
    if (nhc.length > 0) {
      dataContext += `\n\nNHC TROPICAL OUTLOOK:\n`;
      dataContext += JSON.stringify(nhc);
    }
    if (ero.length > 0) {
      dataContext += `\n\nWPC EXCESSIVE RAINFALL OUTLOOK (flood risk):\n`;
      dataContext += JSON.stringify(ero);
    }

    // Generate briefing via Claude
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const message = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 8192,
      system: `You are ATLAS, an AI disaster intelligence analyst. Generate a comprehensive executive briefing from the provided data for emergency management leadership.

When SPC data is present, report BOTH dimensions:
- "How likely?" — the categorical outlook risk level (Marginal through High)
- "How bad could it be?" — hazard-specific probabilities and significant markers (EF2+ tornadoes, 2"+ hail, 75mph+ wind gusts)
If significant markers are present for any hazard, call this out prominently — it means the most intense events are possible.

RESPONSE FORMAT: Respond with valid JSON only — no markdown fences, no text outside JSON:
{
  "narrative": "BLUF format — Bottom Line Up Front. First bullet is ALWAYS the overall assessment in 1-2 sentences: national threat level (LOW/MODERATE/HIGH/CRITICAL), the top CONUS (continental US) threat by name and location, and whether immediate emergency response action is needed. Alaska/maritime-only hazards do NOT lead — focus on population-impacting events in the lower 48 first. Remaining 5-8 bullets provide supporting detail: active threats, key numbers, regional hotspots. Each point on its own line starting with '- '. Use **bold** for key figures and locations. Concise, data-driven, actionable. No paragraphs.",
  "metrics": [{"label": "Short Label", "value": "42", "severity": "critical|high|moderate|low", "trend": "up|down|stable"}],
  "rankings": [{"rank": 1, "location": "Place", "state": "ST", "score": "8.5/10", "severity": "critical|high|moderate|low", "factors": "Brief risk factors", "lat": 29.7, "lon": -95.3}],
  "actions": [{"priority": "immediate|high|medium|low", "action": "What to do", "rationale": "Why"}],
  "mapCommands": [{"type": "zoom", "target": {"lat": 29.7, "lon": -95.3, "zoom": 6}}]
}

Provide 4-6 metrics, 5-7 rankings, 4-6 actions. Use ONLY the provided data. Never fabricate. All lat/lon coordinates MUST be within the continental US (lat 24-50, lon -125 to -66). Do not reference or zoom to locations outside the US.`,
      messages: [{ role: 'user', content: `Generate a comprehensive executive intelligence briefing.\n${dataContext}\n\nRespond with valid JSON only. No markdown code fences. No text before or after the JSON object.` }]
    });

    const responseText = message.content.filter(b => b.type === 'text').map(b => b.text).join('');
    console.log(`[CRON] Claude response: stop_reason=${message.stop_reason}, length=${responseText.length}, first100=${responseText.substring(0, 100)}`);

    let briefing;
    try {
      // Strip markdown fences if present
      let cleaned = responseText.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
      const startIdx = cleaned.indexOf('{');
      if (startIdx === -1) throw new Error('No JSON found');
      let jsonStr = cleaned.substring(startIdx);
      // Handle truncation
      if (message.stop_reason === 'max_tokens') {
        jsonStr = jsonStr.replace(/,\s*"[^"]*$/, '').replace(/,\s*$/, '');
        let openBraces = 0, openBrackets = 0, inStr = false, esc = false;
        for (let i = 0; i < jsonStr.length; i++) {
          const c = jsonStr[i];
          if (esc) { esc = false; continue; }
          if (c === '\\') { esc = true; continue; }
          if (c === '"') { inStr = !inStr; continue; }
          if (inStr) continue;
          if (c === '{') openBraces++;
          else if (c === '}') openBraces--;
          else if (c === '[') openBrackets++;
          else if (c === ']') openBrackets--;
        }
        if (inStr) jsonStr += '"';
        for (let i = 0; i < openBrackets; i++) jsonStr += ']';
        for (let i = 0; i < openBraces; i++) jsonStr += '}';
      }
      briefing = JSON.parse(jsonStr);
    } catch (e) {
      console.error('[CRON] Parse error:', e.message);
      briefing = {
        narrative: 'Automated briefing generation encountered a formatting issue. Please use interactive mode for analysis.',
        metrics: [], rankings: [], actions: [], mapCommands: []
      };
    }

    // Add metadata
    const result = {
      briefing: briefing,
      generatedAt: new Date().toISOString(),
      dataCounts: {
        disasters: disasters.length,
        alerts: alerts.length,
        fires: fires.length,
        earthquakes: earthquakes.length,
        news: news.length,
        spc: spc.length,
        spcIntensity: spcIntensity.length,
        nhc: nhc.length,
        ero: ero.length
      }
    };

    // Store in Vercel Blob
    await put(BLOB_KEY, JSON.stringify(result), {
      access: 'private',
      contentType: 'application/json',
      addRandomSuffix: false,
      allowOverwrite: true,
      token: process.env.BLOB_READ_WRITE_TOKEN
    });

    console.log('[CRON] Briefing stored successfully');
    return res.status(200).json({ success: true, generatedAt: result.generatedAt, dataCounts: result.dataCounts });

  } catch (err) {
    console.error('[CRON] Error:', err);
    return res.status(500).json({ error: 'Briefing generation failed', message: err.message });
  }
};

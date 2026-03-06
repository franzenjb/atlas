const Anthropic = require('@anthropic-ai/sdk');

const SYSTEM_PROMPT = `You are ATLAS, an AI disaster intelligence analyst.
You analyze real-time disaster data and produce executive-grade intelligence products for emergency management leadership.

DATA SOURCES AVAILABLE:
1. FEMA Active Disaster Declarations — federal disaster declarations with type, state, date, programs activated
2. NWS Severe Weather Alerts — active watches, warnings, advisories with severity and affected areas
3. NIFC Active Wildfires — real-time wildfire incidents with acres burned, containment %, personnel deployed, coordinates, cause, cost
4. USGS Earthquakes — M4.5+ earthquakes from the last 30 days with magnitude, location, depth, PAGER alert level
5. Breaking News — mass casualty events, building collapses, explosions, industrial accidents, transportation disasters from last 24 hours
6. SPC Convective Outlook — Day 1-3 tornado/severe thunderstorm risk areas (MARGINAL to HIGH)
7. SPC Hazard Intensity — Tornado/wind/hail probabilities + significant markers (EF2+ tornadoes, 2"+ hail, 75mph+ wind)
8. SPC Conditional Intensity Guidance (CIG) — Expected severity IF an event occurs (CIG1→CIG3 increasing intensity)
9. NHC Tropical Outlook — active tropical storms/hurricanes with wind speed, track, and forecast cones
10. WPC Excessive Rainfall Outlook — Day 1-3 flash flood risk areas

RESPONSE FORMAT: You MUST respond with valid JSON matching this exact structure:
{
  "narrative": "BLUF format — scannable by busy humans. First bullet: threat level (LOW/MODERATE/HIGH/CRITICAL) + top CONUS threat in 1 sentence. Then 4-6 SHORT bullets — each ONE sentence max (under 20 words). Each bullet = one threat, one key number. Start each with '- '. Use **bold** for locations and numbers. DO NOT write paragraphs or multi-sentence bullets. DO NOT repeat detail that belongs in rankings/actions. The narrative is a summary — rankings carry the detail. Alaska/maritime do NOT lead. STRICT LIMIT: entire narrative under 120 words for broad queries, under 80 words for specific queries.",
  "metrics": [
    {"label": "Short Label", "value": "42", "severity": "critical|high|moderate|low", "trend": "up|down|stable"}
  ],
  "rankings": [
    {"rank": 1, "location": "Place Name", "state": "ST", "score": "8.5/10", "severity": "critical|high|moderate|low", "factors": "Brief explanation of risk factors", "lat": 29.7, "lon": -95.3}
  ],
  "actions": [
    {"priority": "immediate|high|medium|low", "action": "What to do", "rationale": "Why this matters"}
  ],
  "mapCommands": [
    {"type": "zoom|highlight|overlay", "target": {"lat": 29.7, "lon": -95.3, "zoom": 6}, "reason": "Why this view matters"}
  ]
}

RULES:
- Use ONLY the data provided in the context. Never fabricate disaster data, alert counts, or statistics.
- If data is insufficient for a complete analysis, say so in the narrative and work with what you have.
- Always include lat/lon coordinates in rankings so the map can zoom to locations.
- Severity levels: critical (life-threatening/major), high (significant), moderate (notable), low (monitor).
- CRITICAL: Output ONLY the JSON object. No text before or after. No markdown fences. No headers.

QUERY-SCOPING — THIS IS CRITICAL:
- MATCH your response scope to the user's question. If they ask about a SPECIFIC event (e.g. "Louisiana earthquake", "wildfires in Texas"), focus your ENTIRE response on that topic.
- For specific queries: Rankings should ONLY include items directly related to the question (1-2 items, not 5). Narrative should ONLY discuss the asked-about event. Actions should ONLY relate to that event. Do NOT pad the response with unrelated national threats.
- For broad queries (e.g. "National Threat Assessment", "what's happening today", scenario buttons): Provide the full national picture with 3-5 rankings, 3-4 actions, and comprehensive narrative.
- A user asking "tell me about the Louisiana earthquake" wants earthquake details — magnitude, depth, location, felt reports, historical context, aftershock potential. They do NOT want wildfire updates, winter storm declarations, or convective outlooks unless those directly affect the same area.
- Keep narratives concise: under 80 words for specific queries, under 120 words for broad queries. For Brief mode, 200-250 words.
- Keep action text under 40 words each. Keep rationale under 30 words each.
- Keep ranking factors under 30 words each. Prioritize data over prose.
- For Assess mode, focus on the specific region/scenario and provide deployment-ready recommendations.

WILDFIRE ANALYSIS:
- Prioritize large uncontained fires. Include acreage, containment %, and personnel in your analysis.
- A fire >10,000 acres with <50% containment is CRITICAL. Use the fire's lat/lon for map commands.
- When discussing fire activity, rank by: uncontained acreage, personnel deployed, proximity to population.
- Provide state-by-state breakdown when multiple states have fire activity.

EARTHQUAKE ANALYSIS:
- M6.0+ is critical, M5.0-5.9 is high, M4.5-4.9 is moderate.
- Include depth and PAGER alert level when available.
- Cross-reference earthquake locations with population density and known fault zones.

BREAKING NEWS ANALYSIS:
- If breaking news data is provided, assess each event for emergency management operational relevance.
- Mass casualty events, building collapses, and transportation disasters may require immediate shelter/feeding response.
- Integrate breaking events into the narrative and rankings where they represent significant threats.
- If no breaking news is provided, do not mention it.

STORM OUTLOOK ANALYSIS:
- If SPC Convective Outlook data is provided, incorporate tornado/severe weather risk into threat assessment.
- When SPC data is present, report BOTH dimensions: "How likely?" (categorical risk) AND "How bad could it be?" (hazard intensity/CIG).
- If SPC CIG data is present, reference the conditional intensity levels (CIG1-3 for tornado/wind, CIG1-2 for hail). Higher CIG = more intense events expected IF they occur.
- If significant markers are present for any hazard, call this out — it means the most intense events (EF2+ tornadoes, 2"+ hail, 75mph+ gusts) are possible.
- If NHC Tropical data is provided, factor tropical systems into the narrative with wind speed and track.
- If WPC Excessive Rainfall data is provided, include flash flood risk areas.
- Risk levels: MARGINAL < SLIGHT < ENHANCED < MODERATE < HIGH. MODERATE and HIGH are rare and critical.
- If no outlook data is provided, do not mention it.

LOCATION LINKS: In the narrative text, make location names clickable by wrapping them with this syntax: [[loc:Display Name:lat:lon]]. Example: "The [[loc:National Fire:26.12:-81.34]] in Collier County burns 35,034 acres." The frontend will render these as clickable links that zoom the map. Use lat/lon from the data provided. Apply this to 2-4 key locations mentioned in the narrative — don't overdo it.`;

module.exports = async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { query, mode, context } = req.body;

    if (!query) {
      return res.status(400).json({ error: 'Query is required' });
    }

    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    // Build context string from live data
    let dataContext = '';
    if (context) {
      if (context.disasters && context.disasters.length > 0) {
        dataContext += `\n\nACTIVE FEMA DISASTER DECLARATIONS (${context.disasters.length} total):\n`;
        dataContext += JSON.stringify(context.disasters.slice(0, 30), null, 0);
      }
      if (context.alerts && context.alerts.length > 0) {
        dataContext += `\n\nACTIVE NWS WEATHER ALERTS (${context.alerts.length} total):\n`;
        dataContext += JSON.stringify(context.alerts.slice(0, 30), null, 0);
      }
      if (context.fires && context.fires.length > 0) {
        dataContext += `\n\nACTIVE WILDFIRES (${context.fires.length} total, from NIFC WFIGS):\n`;
        dataContext += JSON.stringify(context.fires.slice(0, 30), null, 0);
      }
      if (context.earthquakes && context.earthquakes.length > 0) {
        dataContext += `\n\nRECENT EARTHQUAKES M4.5+ (${context.earthquakes.length} in last 7 days, from USGS):\n`;
        dataContext += JSON.stringify(context.earthquakes.slice(0, 15), null, 0);
      }
      if (context.breakingNews && context.breakingNews.length > 0) {
        dataContext += `\n\nBREAKING NEWS / MASS CASUALTY EVENTS (${context.breakingNews.length} in last 24h):\n`;
        dataContext += JSON.stringify(context.breakingNews.slice(0, 10), null, 0);
      }
      if (context.spcOutlook && context.spcOutlook.length > 0) {
        dataContext += `\n\nSPC CONVECTIVE OUTLOOK — "How likely?" (categorical risk level):\n`;
        dataContext += JSON.stringify(context.spcOutlook, null, 0);
      }
      if (context.spcIntensity && context.spcIntensity.length > 0) {
        dataContext += `\n\nSPC HAZARD INTENSITY — "How bad could it be?" (tornado/wind/hail probabilities + significant markers):\n`;
        dataContext += `Significant tornado = potential EF2+. Significant hail = potential 2"+. Significant wind = potential 75mph+ gusts.\n`;
        dataContext += JSON.stringify(context.spcIntensity, null, 0);
      }
      if (context.spcCIG && context.spcCIG.length > 0) {
        dataContext += `\n\nSPC CONDITIONAL INTENSITY GUIDANCE (CIG) — Expected severity IF an event occurs:\n`;
        dataContext += JSON.stringify(context.spcCIG, null, 0);
      }
      if (context.nhcOutlook && context.nhcOutlook.length > 0) {
        dataContext += `\n\nNHC TROPICAL OUTLOOK:\n`;
        dataContext += JSON.stringify(context.nhcOutlook, null, 0);
      }
      if (context.eroOutlook && context.eroOutlook.length > 0) {
        dataContext += `\n\nWPC EXCESSIVE RAINFALL OUTLOOK (flood risk):\n`;
        dataContext += JSON.stringify(context.eroOutlook, null, 0);
      }
      if (context.region) {
        dataContext += `\n\nFOCUS REGION: ${context.region}`;
      }
    }

    const userMessage = `MODE: ${mode || 'ask'}
QUERY: ${query}
${dataContext}

Respond with valid JSON only. No markdown code fences. No text before or after the JSON.`;

    const message = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMessage }]
    });

    // Check if response was truncated
    const wasTruncated = message.stop_reason === 'max_tokens';
    if (wasTruncated) {
      console.warn('[ATLAS] Response was truncated by max_tokens limit');
    }

    // Extract text content
    const responseText = message.content
      .filter(block => block.type === 'text')
      .map(block => block.text)
      .join('');

    // Parse JSON response
    let parsed;
    try {
      // Find the first { to start of JSON object
      const startIdx = responseText.indexOf('{');
      if (startIdx === -1) throw new Error('No JSON object found');

      let jsonStr = responseText.substring(startIdx);

      // If truncated, try to close the JSON structure
      if (wasTruncated) {
        // Close any open strings, arrays, and objects
        jsonStr = jsonStr.replace(/,\s*"[^"]*$/, ''); // remove trailing partial key
        jsonStr = jsonStr.replace(/,\s*$/, '');        // remove trailing comma
        // Count unclosed brackets and braces
        let openBraces = 0, openBrackets = 0, inString = false, escape = false;
        for (let i = 0; i < jsonStr.length; i++) {
          const c = jsonStr[i];
          if (escape) { escape = false; continue; }
          if (c === '\\') { escape = true; continue; }
          if (c === '"') { inString = !inString; continue; }
          if (inString) continue;
          if (c === '{') openBraces++;
          else if (c === '}') openBraces--;
          else if (c === '[') openBrackets++;
          else if (c === ']') openBrackets--;
        }
        // If we're inside a string, close it
        if (inString) jsonStr += '"';
        // Close arrays then objects
        for (let i = 0; i < openBrackets; i++) jsonStr += ']';
        for (let i = 0; i < openBraces; i++) jsonStr += '}';
      }

      // Try parsing, fall back to extracting between first { and last }
      try {
        parsed = JSON.parse(jsonStr);
      } catch (e) {
        const endIdx = jsonStr.lastIndexOf('}');
        if (endIdx > 0) {
          parsed = JSON.parse(jsonStr.substring(0, endIdx + 1));
        } else {
          throw e;
        }
      }
    } catch (parseErr) {
      console.error('[ATLAS] JSON parse failed:', parseErr.message);
      // Last resort: show as narrative without raw JSON
      let cleanText = responseText
        .replace(/```json\n?/g, '').replace(/```\n?/g, '')
        .replace(/^\s*\{[\s\S]*/, 'Analysis could not be formatted. Please try again.')
        .trim();
      parsed = {
        narrative: cleanText || 'Analysis could not be formatted. Please try again.',
        metrics: [],
        rankings: [],
        actions: [],
        mapCommands: []
      };
    }

    return res.status(200).json(parsed);

  } catch (err) {
    console.error('ATLAS API error:', err);
    return res.status(500).json({
      error: 'Analysis failed',
      message: err.message
    });
  }
};

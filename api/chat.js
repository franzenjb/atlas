const Anthropic = require('@anthropic-ai/sdk');

const SYSTEM_PROMPT = `You are ATLAS, an AI disaster intelligence analyst for the American Red Cross.
You analyze real-time disaster data and produce executive-grade intelligence products.

DATA SOURCES AVAILABLE:
1. FEMA Active Disaster Declarations — federal disaster declarations with type, state, date, programs activated
2. NWS Severe Weather Alerts — active watches, warnings, advisories with severity and affected areas
3. NIFC Active Wildfires — real-time wildfire incidents with acres burned, containment %, personnel deployed, coordinates, cause, cost
4. USGS Earthquakes — M4.5+ earthquakes from the last 30 days with magnitude, location, depth, PAGER alert level

RESPONSE FORMAT: You MUST respond with valid JSON matching this exact structure:
{
  "narrative": "2-3 paragraph executive summary. Use **bold** for emphasis. Mention specific locations, numbers, and risk factors. Tone: Economist magazine meets military intelligence briefing — concise, authoritative, actionable.",
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
- Metrics array should have 3-4 items. Rankings should have 3-5 items. Actions should have 3-4 items.
- mapCommands should have 1-2 items — the most important views.
- Severity levels: critical (life-threatening/major), high (significant), moderate (notable), low (monitor).
- Keep the narrative under 200 words. Be specific with numbers and locations.
- For Brief mode, write a longer narrative (300-400 words) covering all threat categories systematically.
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
        dataContext += `\n\nRECENT EARTHQUAKES M4.5+ (${context.earthquakes.length} in last 30 days, from USGS):\n`;
        dataContext += JSON.stringify(context.earthquakes.slice(0, 15), null, 0);
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
      max_tokens: 1500,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMessage }]
    });

    // Extract text content
    const responseText = message.content
      .filter(block => block.type === 'text')
      .map(block => block.text)
      .join('');

    // Parse JSON response — extract first {...} block, ignore any surrounding text
    let parsed;
    try {
      // Find the first { and last } to extract the JSON object
      const startIdx = responseText.indexOf('{');
      const endIdx = responseText.lastIndexOf('}');
      if (startIdx === -1 || endIdx === -1 || endIdx <= startIdx) {
        throw new Error('No JSON object found in response');
      }
      const jsonStr = responseText.substring(startIdx, endIdx + 1);
      parsed = JSON.parse(jsonStr);
    } catch (parseErr) {
      // If JSON parse fails, wrap raw text as narrative
      parsed = {
        narrative: responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '').replace(/^\s*\{[\s\S]*\}\s*$/, '').trim() || responseText,
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

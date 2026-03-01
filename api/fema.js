// Proxy for FEMA API to avoid CORS issues
module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const url = 'https://www.fema.gov/api/open/v2/DisasterDeclarationsSummaries?$orderby=declarationDate%20desc&$top=200';

    const response = await fetch(url, {
      headers: { 'Accept': 'application/json' }
    });

    if (!response.ok) throw new Error(`FEMA API: ${response.status}`);

    const data = await response.json();
    const records = data.DisasterDeclarationsSummaries || [];

    // Filter: last 120 days, not closed out
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 120);
    const filtered = records.filter(d => {
      const declDate = new Date(d.declarationDate);
      return declDate >= cutoff;
    });

    // Return in the format data.js expects
    res.status(200).json({ DisasterDeclarationsSummaries: filtered });
  } catch (err) {
    console.error('FEMA proxy error:', err.message);
    res.status(200).json({ DisasterDeclarationsSummaries: [] });
  }
};

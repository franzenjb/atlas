// Proxy for FEMA API to avoid CORS issues
module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 365);
    const cutoffStr = cutoff.toISOString().split('T')[0];

    const url = `https://www.fema.gov/api/open/v2/DisasterDeclarations?$filter=declarationDate ge '${cutoffStr}' and disasterCloseoutDate eq null&$orderby=declarationDate desc&$top=200`;

    const response = await fetch(url);
    if (!response.ok) throw new Error(`FEMA API: ${response.status}`);

    const data = await response.json();
    res.status(200).json(data);
  } catch (err) {
    console.error('FEMA proxy error:', err);
    res.status(500).json({ error: err.message });
  }
};

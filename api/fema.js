// Proxy for FEMA API to avoid CORS issues
module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    // Get recent disaster declarations (last 120 days)
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 120);
    const cutoffStr = cutoff.toISOString().split('T')[0];

    const params = new URLSearchParams({
      '$filter': `declarationDate ge '${cutoffStr}'`,
      '$orderby': 'declarationDate desc',
      '$top': '300'
    });

    const url = `https://www.fema.gov/api/open/v2/DisasterDeclarations?${params.toString()}`;
    console.log('FEMA fetch:', url);

    const response = await fetch(url, {
      headers: { 'Accept': 'application/json' }
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`FEMA API ${response.status}: ${text.substring(0, 200)}`);
    }

    const data = await response.json();
    console.log('FEMA returned', (data.DisasterDeclarations || []).length, 'records');
    res.status(200).json(data);
  } catch (err) {
    console.error('FEMA proxy error:', err);
    res.status(500).json({ error: err.message });
  }
};

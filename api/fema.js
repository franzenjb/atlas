// Proxy for FEMA API to avoid CORS issues
module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    // Get recent disaster declarations — simple top-N, sorted by date desc
    // Avoid OData filter issues — just get the latest 200 declarations
    const url = 'https://www.fema.gov/api/open/v2/DisasterDeclarations?$orderby=declarationDate%20desc&$top=200&$select=disasterNumber,state,declarationTitle,declarationDate,incidentType,incidentBeginDate,incidentEndDate,declarationType,designatedArea,ihProgramDeclared,iaProgramDeclared,paProgramDeclared,hmProgramDeclared,disasterCloseoutDate';

    const response = await fetch(url, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'ATLAS/1.0'
      }
    });

    const text = await response.text();

    // Check if we got HTML instead of JSON
    if (text.startsWith('<!DOCTYPE') || text.startsWith('<html')) {
      console.error('FEMA returned HTML instead of JSON');
      // Return empty but valid result
      return res.status(200).json({ DisasterDeclarations: [] });
    }

    const data = JSON.parse(text);

    // Filter client-side: only declarations from last 120 days that aren't closed
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 120);
    const filtered = (data.DisasterDeclarations || []).filter(d => {
      const declDate = new Date(d.declarationDate);
      return declDate >= cutoff && !d.disasterCloseoutDate;
    });

    console.log(`FEMA: ${(data.DisasterDeclarations || []).length} total, ${filtered.length} active (last 120 days)`);
    res.status(200).json({ DisasterDeclarations: filtered });

  } catch (err) {
    console.error('FEMA proxy error:', err.message);
    res.status(200).json({ DisasterDeclarations: [], error: err.message });
  }
};

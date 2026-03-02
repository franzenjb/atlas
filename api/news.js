module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Cache-Control', 'public, max-age=300');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const apiKey = process.env.CURRENTS_API_KEY;
    if (!apiKey) {
      return res.status(200).json({ news: [] });
    }

    const keywords = 'mass shooting OR active shooter OR building collapse OR explosion OR industrial accident OR train derailment OR plane crash OR chemical spill OR mass casualty OR dam failure OR bridge collapse OR pipeline explosion';
    const url = `https://api.currentsapi.services/v1/search?keywords=${encodeURIComponent(keywords)}&language=en&country=US&type=1&apiKey=${apiKey}`;

    const apiRes = await fetch(url);
    if (!apiRes.ok) {
      console.error('[NEWS] Currents API error:', apiRes.status);
      return res.status(200).json({ news: [] });
    }

    const data = await apiRes.json();

    // Filter to last 24 hours
    const cutoff = new Date();
    cutoff.setHours(cutoff.getHours() - 24);

    const filtered = (data.news || [])
      .filter(n => new Date(n.published) >= cutoff)
      .slice(0, 20)
      .map(n => ({
        title: n.title,
        description: (n.description || '').substring(0, 200),
        source: n.author || 'Unknown',
        publishedAt: n.published,
        url: n.url,
        category: n.category ? n.category.join(', ') : ''
      }));

    return res.status(200).json({ news: filtered });

  } catch (err) {
    console.error('[NEWS] Error:', err);
    return res.status(200).json({ news: [] });
  }
};

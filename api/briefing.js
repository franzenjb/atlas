const { head } = require('@vercel/blob');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Cache-Control', 'public, max-age=300'); // 5 min cache

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const token = process.env.BLOB_READ_WRITE_TOKEN;

    // Get the briefing blob by exact pathname
    const blob = await head('atlas-briefing.json', { token });

    if (!blob || !blob.url) {
      return res.status(404).json({ error: 'No cached briefing available' });
    }

    // Private blobs need auth header to read
    const blobRes = await fetch(blob.url, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!blobRes.ok) {
      return res.status(500).json({ error: 'Failed to read cached briefing' });
    }

    const data = await blobRes.json();
    return res.status(200).json(data);

  } catch (err) {
    // head() throws if blob doesn't exist
    if (err.message && err.message.includes('not found')) {
      return res.status(404).json({ error: 'No cached briefing available' });
    }
    console.error('[BRIEFING] Error:', err);
    return res.status(500).json({ error: 'Failed to fetch briefing', message: err.message });
  }
};

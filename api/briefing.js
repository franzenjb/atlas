const { list } = require('@vercel/blob');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Cache-Control', 'public, max-age=300'); // 5 min cache

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const token = process.env.BLOB_READ_WRITE_TOKEN;

    // List blobs to find the briefing
    const { blobs } = await list({ prefix: 'atlas-briefing', token });

    if (!blobs || blobs.length === 0) {
      return res.status(404).json({ error: 'No cached briefing available' });
    }

    // Get the most recent blob
    const blob = blobs[blobs.length - 1];

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
    console.error('[BRIEFING] Error:', err);
    return res.status(500).json({ error: 'Failed to fetch briefing', message: err.message });
  }
};

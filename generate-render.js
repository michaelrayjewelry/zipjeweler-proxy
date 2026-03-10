// api/generate-render.js
// ZipJeweler render proxy — zero npm dependencies.
// Uses native fetch (Node 18+, included on Vercel).
// Auth format per Higgsfield JS SDK: "Authorization: Key ID:SECRET"

export default async function handler(req, res) {

  // ── CORS ────────────────────────────────────────────────
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // ── Env vars ────────────────────────────────────────────
  const keyId     = process.env.HIGGSFIELD_KEY_ID;
  const keySecret = process.env.HIGGSFIELD_KEY_SECRET;
  if (!keyId || !keySecret) {
    return res.status(500).json({ error: 'Missing HIGGSFIELD_KEY_ID or HIGGSFIELD_KEY_SECRET' });
  }

  // ── Parse body ──────────────────────────────────────────
  const { prompt, aspect_ratio = '1:1' } = req.body || {};
  if (!prompt || prompt.trim().length < 5) {
    return res.status(400).json({ error: 'prompt is required' });
  }

  const qualityPrefix = prompt.toLowerCase().includes('photorealistic') ? '' :
    'Photorealistic luxury jewelry photography, macro lens, ultra-sharp, ray-traced reflections, 8K, ';
  const fullPrompt = qualityPrefix + prompt.trim();

  const AUTH = `Key ${keyId}:${keySecret}`;
  const BASE = 'https://api.cloud.higgsfield.ai';

  // ── Step 1: Submit job ──────────────────────────────────
  let requestId;
  try {
    const submitRes = await fetch(`${BASE}/flux-pro/kontext/max/text-to-image`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': AUTH },
      body: JSON.stringify({
        prompt: fullPrompt,
        aspect_ratio,
        safety_tolerance: 2,
        seed: Math.floor(Math.random() * 999999)
      })
    });
    const submitData = await submitRes.json();
    if (!submitRes.ok) {
      return res.status(submitRes.status).json({ error: submitData?.detail || submitData?.error || 'Submit failed' });
    }
    requestId = submitData?.id || submitData?.request_id;
    if (!requestId) return res.status(500).json({ error: 'No request ID returned', raw: submitData });
  } catch (e) {
    return res.status(500).json({ error: 'Submit error: ' + e.message });
  }

  // ── Step 2: Poll for completion (max 55s) ───────────────
  const deadline = Date.now() + 55000;
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 2000));
    try {
      const pollRes = await fetch(`${BASE}/requests/${requestId}/status`, {
        headers: { 'Authorization': AUTH }
      });
      const pollData = await pollRes.json();
      const status = pollData?.status;

      if (status === 'completed' || status === 'succeeded') {
        const url = pollData?.result?.images?.[0]?.url
                 || pollData?.results?.raw?.url
                 || pollData?.output?.[0]
                 || pollData?.image_url;
        if (!url) return res.status(500).json({ error: 'Completed but no image URL', raw: pollData });
        return res.status(200).json({ url });
      }
      if (status === 'failed' || status === 'error' || status === 'cancelled') {
        return res.status(500).json({ error: `Job ${status}`, raw: pollData });
      }
      // queued / processing — keep polling
    } catch (e) {
      return res.status(500).json({ error: 'Poll error: ' + e.message });
    }
  }

  return res.status(504).json({ error: 'Timed out waiting for render. Try again.' });
}

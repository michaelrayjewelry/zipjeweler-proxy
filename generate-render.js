// api/generate-render.js
// ZipJeweler render proxy — receives a prompt from the browser,
// calls Higgsfield FLUX, returns the image URL.
// Deployed on Vercel. Never exposes API keys to the client.

import { higgsfield, config } from '@higgsfield/client/v2';

config({
  credentials: `${process.env.HIGGSFIELD_KEY_ID}:${process.env.HIGGSFIELD_KEY_SECRET}`
});

export default async function handler(req, res) {

  // ── CORS preflight ──────────────────────────────────────
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // ── Validate env vars ───────────────────────────────────
  if (!process.env.HIGGSFIELD_KEY_ID || !process.env.HIGGSFIELD_KEY_SECRET) {
    return res.status(500).json({
      error: 'Missing HIGGSFIELD_KEY_ID or HIGGSFIELD_KEY_SECRET environment variables.'
    });
  }

  // ── Parse body ──────────────────────────────────────────
  const { prompt, aspect_ratio = '1:1' } = req.body || {};

  if (!prompt || typeof prompt !== 'string' || prompt.trim().length < 10) {
    return res.status(400).json({ error: 'prompt is required (min 10 chars).' });
  }

  // ── Build the full jewelry render prompt ────────────────
  // Prepend quality modifiers if not already in the prompt
  const qualityPrefix = prompt.toLowerCase().includes('photorealistic')
    ? ''
    : 'Photorealistic luxury jewelry photography, macro lens, ultra-sharp, ray-traced reflections, 8K, ';

  const fullPrompt = qualityPrefix + prompt.trim();

  // ── Call Higgsfield FLUX ────────────────────────────────
  try {
    const jobSet = await higgsfield.subscribe(
      'flux-pro/kontext/max/text-to-image',
      {
        input: {
          prompt: fullPrompt,
          aspect_ratio,        // '1:1' default — square product shot
          safety_tolerance: 2,
          seed: Math.floor(Math.random() * 999999)
        },
        withPolling: true      // SDK polls until complete — up to 60s
      }
    );

    if (!jobSet.isCompleted) {
      return res.status(504).json({ error: 'Render timed out. Try again.' });
    }

    const imageUrl = jobSet.jobs?.[0]?.results?.raw?.url;

    if (!imageUrl) {
      return res.status(500).json({
        error: 'Higgsfield returned no image URL.',
        debug: JSON.stringify(jobSet.jobs?.[0]?.results || {})
      });
    }

    return res.status(200).json({ url: imageUrl });

  } catch (err) {
    console.error('[generate-render] Higgsfield error:', err);
    return res.status(500).json({
      error: err?.message || 'Image generation failed.'
    });
  }
}

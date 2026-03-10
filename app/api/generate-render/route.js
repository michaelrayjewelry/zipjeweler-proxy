// app/api/generate-render/route.js
// Next.js App Router API route — zero dependencies, native fetch (Node 18+)

export async function OPTIONS() {
  return new Response(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}

export async function POST(request) {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  const keyId     = process.env.HIGGSFIELD_KEY_ID;
  const keySecret = process.env.HIGGSFIELD_KEY_SECRET;
  if (!keyId || !keySecret) {
    return Response.json({ error: 'Missing HIGGSFIELD_KEY_ID or HIGGSFIELD_KEY_SECRET' }, { status: 500, headers: corsHeaders });
  }

  let body;
  try { body = await request.json(); } catch { body = {}; }

  const { prompt, aspect_ratio = '1:1' } = body;
  if (!prompt || prompt.trim().length < 5) {
    return Response.json({ error: 'prompt is required' }, { status: 400, headers: corsHeaders });
  }

  // Append quality suffix only if prompt doesn't already include photography direction
  const lower = prompt.toLowerCase();
  const hasPhotoDir = lower.includes('photography') || lower.includes('photorealistic') || lower.includes('macro') || lower.includes('8k');
  const qualitySuffix = hasPhotoDir ? '' : '. Photorealistic luxury jewelry photography, soft studio lighting, sharp macro detail.';
  const fullPrompt = prompt.trim() + qualitySuffix;

  const AUTH = `Key ${keyId}:${keySecret}`;
  const BASE = 'https://platform.higgsfield.ai';

  // Submit job
  let requestId;
  try {
    const submitRes = await fetch(`${BASE}/flux-pro/kontext/max/text-to-image`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': AUTH },
      body: JSON.stringify({ prompt: fullPrompt, aspect_ratio, safety_tolerance: 2, seed: Math.floor(Math.random() * 999999) })
    });
    const submitData = await submitRes.json();
    if (!submitRes.ok) return Response.json({ error: submitData?.detail || submitData?.error || 'Submit failed', raw: submitData }, { status: submitRes.status, headers: corsHeaders });
    requestId = submitData?.id || submitData?.request_id;
    if (!requestId) return Response.json({ error: 'No request ID returned', raw: submitData }, { status: 500, headers: corsHeaders });
  } catch (e) {
    return Response.json({ error: 'Submit error: ' + e.message }, { status: 500, headers: corsHeaders });
  }

  // Poll up to 55s
  const deadline = Date.now() + 55000;
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 2500));
    try {
      const pollRes = await fetch(`${BASE}/requests/${requestId}/status`, { headers: { 'Authorization': AUTH } });
      const pollData = await pollRes.json();
      const status = pollData?.status;
      if (status === 'completed' || status === 'succeeded') {
        const url = pollData?.images?.[0]?.url || pollData?.result?.images?.[0]?.url || pollData?.results?.raw?.url || pollData?.output?.[0] || pollData?.image_url;
        if (!url) return Response.json({ error: 'Completed but no image URL', raw: pollData }, { status: 500, headers: corsHeaders });
        return Response.json({ url }, { headers: corsHeaders });
      }
      if (status === 'failed' || status === 'error' || status === 'cancelled' || status === 'nsfw') {
        return Response.json({ error: `Job ${status}`, raw: pollData }, { status: 500, headers: corsHeaders });
      }
    } catch (e) {
      return Response.json({ error: 'Poll error: ' + e.message }, { status: 500, headers: corsHeaders });
    }
  }
  return Response.json({ error: 'Timed out. Try again.' }, { status: 504, headers: corsHeaders });
}

export async function GET() {
  return Response.json(
    {
      status: 'ok',
      service: 'zipjeweler-proxy',
      hasKeyId: !!process.env.HIGGSFIELD_KEY_ID,
      hasKeySecret: !!process.env.HIGGSFIELD_KEY_SECRET,
      timestamp: new Date().toISOString(),
    },
    {
      headers: {
        'Access-Control-Allow-Origin': '*',
      },
    }
  );
}

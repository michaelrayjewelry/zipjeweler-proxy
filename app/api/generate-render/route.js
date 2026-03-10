// app/api/generate-render/route.js
// Next.js App Router API route — supports OpenAI gpt-image-1.5 (primary) and Higgsfield FLUX (fallback)
// For C2R: image editing (input_image + material instruction)
// For S2I/Imagine: generation or image-conditioned generation

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

  let body;
  try { body = await request.json(); } catch { body = {}; }

  const { prompt, aspect_ratio = '1:1', input_image, input_image_2, input_image_3, input_image_4, mask_image, quality = 'high', input_fidelity } = body;
  if (!prompt || prompt.trim().length < 5) {
    return Response.json({ error: 'prompt is required' }, { status: 400, headers: corsHeaders });
  }

  const hasInputImage = input_image && input_image.length > 100;

  // Try OpenAI first, then Higgsfield fallback
  const openaiKey = process.env.OPENAI_API_KEY;
  if (openaiKey) {
    try {
      const result = await openaiGenerate({ openaiKey, prompt: prompt.trim(), hasInputImage, input_image, input_image_2, input_image_3, input_image_4, mask_image, aspect_ratio, quality, input_fidelity });
      return Response.json(result, { headers: corsHeaders });
    } catch (e) {
      // If OpenAI fails, fall through to Higgsfield
      console.error('OpenAI image API error:', e.message);
    }
  }

  // Higgsfield fallback
  const keyId     = process.env.HIGGSFIELD_KEY_ID;
  const keySecret = process.env.HIGGSFIELD_KEY_SECRET;
  if (!keyId || !keySecret) {
    return Response.json({ error: 'No image generation API keys configured. Set OPENAI_API_KEY or HIGGSFIELD_KEY_ID + HIGGSFIELD_KEY_SECRET.' }, { status: 500, headers: corsHeaders });
  }

  try {
    const result = await higgsGenerate({ keyId, keySecret, prompt: prompt.trim(), hasInputImage, input_image, aspect_ratio });
    return Response.json(result, { headers: corsHeaders });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500, headers: corsHeaders });
  }
}

// ────────────────────────────────────────────────────────────
// OpenAI gpt-image-1.5 — supports both generation and image editing
// ────────────────────────────────────────────────────────────
async function openaiGenerate({ openaiKey, prompt, hasInputImage, input_image, input_image_2, input_image_3, input_image_4, mask_image, aspect_ratio, quality, input_fidelity }) {
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${openaiKey}`,
  };

  // Map aspect ratio to OpenAI size format
  const sizeMap = {
    '1:1': '1024x1024',
    '16:9': '1536x1024',
    '9:16': '1024x1536',
    '4:3': '1536x1024',
    '3:4': '1024x1536',
  };
  const size = sizeMap[aspect_ratio] || '1024x1024';

  if (hasInputImage) {
    // Image EDIT — multipart/form-data per OpenAI docs
    // Convert base64 images to Blobs for FormData upload
    const formData = new FormData();
    formData.append('model', 'gpt-image-1.5');
    formData.append('prompt', prompt);
    formData.append('size', size);
    formData.append('quality', quality);
    formData.append('input_fidelity', input_fidelity || 'high');

    // Helper: convert base64 (with or without data: prefix) to a Blob
    function base64ToBlob(b64str) {
      const raw = b64str.startsWith('data:') ? b64str.split(',')[1] : b64str;
      const bytes = Buffer.from(raw, 'base64');
      return new Blob([bytes], { type: 'image/png' });
    }

    // Append input images as image[] entries (matches curl -F "image[]=@file.png")
    if (input_image) formData.append('image[]', base64ToBlob(input_image), 'input.png');
    if (input_image_2) formData.append('image[]', base64ToBlob(input_image_2), 'input2.png');
    if (input_image_3) formData.append('image[]', base64ToBlob(input_image_3), 'input3.png');
    if (input_image_4) formData.append('image[]', base64ToBlob(input_image_4), 'input4.png');

    // Mask: transparent alpha = area to edit, opaque = area to preserve
    // For C2R the mask covers the jewelry object so only it gets material conversion
    if (mask_image) {
      formData.append('mask', base64ToBlob(mask_image), 'mask.png');
    }

    const res = await fetch('https://api.openai.com/v1/images/edits', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${openaiKey}` },
      body: formData,
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data?.error?.message || `OpenAI edit error: HTTP ${res.status}`);
    }

    // OpenAI gpt-image-1.5 returns base64 directly
    const b64 = data?.data?.[0]?.b64_json;
    if (!b64) throw new Error('No image data returned from OpenAI');

    return { url: `data:image/png;base64,${b64}`, mode: 'openai-edit' };

  } else {
    // Image GENERATION — text prompt only (for Imagine tool)
    // Append quality suffix if not already present
    const lower = prompt.toLowerCase();
    const hasPhotoDir = lower.includes('photography') || lower.includes('photorealistic') || lower.includes('macro') || lower.includes('8k');
    const fullPrompt = hasPhotoDir ? prompt : prompt + '. Photorealistic luxury jewelry photography, soft studio lighting, sharp macro detail.';

    const genBody = {
      model: 'gpt-image-1.5',
      prompt: fullPrompt,
      size,
      quality,
      n: 1,
    };

    const res = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers,
      body: JSON.stringify(genBody),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data?.error?.message || `OpenAI generation error: HTTP ${res.status}`);
    }

    const b64 = data?.data?.[0]?.b64_json;
    const url = data?.data?.[0]?.url;
    if (!b64 && !url) throw new Error('No image data returned from OpenAI');

    return { url: b64 ? `data:image/png;base64,${b64}` : url, mode: 'openai-generate' };
  }
}

// ────────────────────────────────────────────────────────────
// Higgsfield FLUX Kontext — fallback (text-to-image + img2img attempt)
// ────────────────────────────────────────────────────────────
async function higgsGenerate({ keyId, keySecret, prompt, hasInputImage, input_image, aspect_ratio }) {
  const AUTH = `Key ${keyId}:${keySecret}`;
  const BASE = 'https://platform.higgsfield.ai';

  // Append quality suffix
  const lower = prompt.toLowerCase();
  const hasPhotoDir = lower.includes('photography') || lower.includes('photorealistic') || lower.includes('macro') || lower.includes('8k');
  const qualitySuffix = hasPhotoDir ? '' : '. Photorealistic luxury jewelry photography, soft studio lighting, sharp macro detail.';
  const fullPrompt = prompt + qualitySuffix;

  const basePayload = { prompt: fullPrompt, aspect_ratio, safety_tolerance: 2, seed: Math.floor(Math.random() * 999999) };

  let requestId;
  let usedMode = 'higgsfield-text-to-image';

  // Try img2img if we have an input image
  if (hasInputImage) {
    const img2imgPayload = {
      ...basePayload,
      input_image: input_image.startsWith('data:') ? input_image : `data:image/jpeg;base64,${input_image}`,
    };

    try {
      const submitRes = await fetch(`${BASE}/flux-pro/kontext/max/image-to-image`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': AUTH },
        body: JSON.stringify(img2imgPayload)
      });
      if (submitRes.ok) {
        const submitData = await submitRes.json();
        requestId = submitData?.id || submitData?.request_id;
        if (requestId) usedMode = 'higgsfield-image-to-image';
      }
    } catch (e) { /* fall through */ }
  }

  // Fallback: text-to-image
  if (!requestId) {
    const submitRes = await fetch(`${BASE}/flux-pro/kontext/max/text-to-image`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': AUTH },
      body: JSON.stringify(basePayload)
    });
    const submitData = await submitRes.json();
    if (!submitRes.ok) throw new Error(submitData?.detail || submitData?.error || 'Higgsfield submit failed');
    requestId = submitData?.id || submitData?.request_id;
    if (!requestId) throw new Error('No request ID returned from Higgsfield');
  }

  // Poll up to 55s
  const deadline = Date.now() + 55000;
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 2500));
    const pollRes = await fetch(`${BASE}/requests/${requestId}/status`, { headers: { 'Authorization': AUTH } });
    const pollData = await pollRes.json();
    const status = pollData?.status;
    if (status === 'completed' || status === 'succeeded') {
      const url = pollData?.images?.[0]?.url || pollData?.result?.images?.[0]?.url || pollData?.results?.raw?.url || pollData?.output?.[0] || pollData?.image_url;
      if (!url) throw new Error('Completed but no image URL');
      return { url, mode: usedMode };
    }
    if (status === 'failed' || status === 'error' || status === 'cancelled' || status === 'nsfw') {
      throw new Error(`Higgsfield job ${status}`);
    }
  }
  throw new Error('Higgsfield timed out');
}

export async function GET() {
  return Response.json(
    {
      status: 'ok',
      service: 'zipjeweler-proxy',
      hasOpenAI: !!process.env.OPENAI_API_KEY,
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

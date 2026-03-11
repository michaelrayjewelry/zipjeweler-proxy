// app/api/generate-render/route.js
// Next.js App Router API route — OpenAI Responses API (primary) + Higgsfield FLUX (fallback)
// For S2I: sketch-to-image generation/editing with multi-turn correction support
// Now uses the same Responses API + gpt-4.1 approach as C2R's generate-image route

export const maxDuration = 60; // Allow up to 60s for image generation

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

  const {
    prompt,
    input_image,              // base64 image (sketch or reference)
    input_image_2,            // additional reference images
    input_image_3,
    input_image_4,
    mask_image,               // mask for targeted editing
    previous_response_id,     // for multi-turn corrections
    action = 'auto',          // "edit" = force edit, "generate" = new image, "auto" = model decides
    aspect_ratio = '1:1',
    quality = 'high',
    size,                     // if provided, use directly; otherwise derive from aspect_ratio
    input_fidelity = 'high',
  } = body;

  if (!prompt || prompt.trim().length < 5) {
    return Response.json({ error: 'prompt is required' }, { status: 400, headers: corsHeaders });
  }

  const hasInputImage = input_image && input_image.length > 100;

  // Try OpenAI Responses API first, then Higgsfield fallback
  const openaiKey = process.env.OPENAI_API_KEY;
  let openaiError = null;
  if (openaiKey) {
    try {
      const result = await responsesGenerate({
        openaiKey,
        prompt: prompt.trim(),
        hasInputImage,
        input_image,
        input_image_2,
        input_image_3,
        input_image_4,
        mask_image,
        previous_response_id,
        action,
        aspect_ratio,
        quality,
        size,
        input_fidelity,
      });
      return Response.json(result, { headers: corsHeaders });
    } catch (e) {
      console.error('Responses API error:', e.message);
      openaiError = e.message;
      // Fall through to Higgsfield
    }
  }

  // Higgsfield fallback
  const keyId     = process.env.HIGGSFIELD_KEY_ID;
  const keySecret = process.env.HIGGSFIELD_KEY_SECRET;
  if (!keyId || !keySecret) {
    // Surface the actual OpenAI error if it was attempted
    const detail = openaiError
      ? 'OpenAI error: ' + openaiError
      : 'No image generation API keys configured. Set OPENAI_API_KEY or HIGGSFIELD_KEY_ID + HIGGSFIELD_KEY_SECRET.';
    return Response.json({ error: detail }, { status: 500, headers: corsHeaders });
  }

  try {
    const result = await higgsGenerate({ keyId, keySecret, prompt: prompt.trim(), hasInputImage, input_image, aspect_ratio });
    return Response.json(result, { headers: corsHeaders });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500, headers: corsHeaders });
  }
}

// ────────────────────────────────────────────────────────────
// OpenAI Responses API with gpt-4.1 — same approach as C2R
// Supports multi-turn corrections via previous_response_id
// ────────────────────────────────────────────────────────────
async function responsesGenerate({ openaiKey, prompt, hasInputImage, input_image, input_image_2, input_image_3, input_image_4, mask_image, previous_response_id, action, aspect_ratio, quality, size, input_fidelity }) {
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${openaiKey}`,
  };

  // Resolve size: use explicit size, or derive from aspect_ratio
  let resolvedSize = size || 'auto';
  if (!size) {
    const sizeMap = {
      '1:1': '1024x1024',
      '16:9': '1536x1024',
      '9:16': '1024x1536',
      '4:3': '1536x1024',
      '3:4': '1024x1536',
    };
    resolvedSize = sizeMap[aspect_ratio] || 'auto';
  }

  // Helper: wrap raw base64 as a data URL, auto-detecting JPEG vs PNG
  function toDataUrl(b64str) {
    if (b64str.startsWith('data:')) return b64str;
    // JPEG starts with /9j in base64, PNG starts with iVBOR
    const mime = b64str.startsWith('/9j') ? 'image/jpeg' : 'image/png';
    return `data:${mime};base64,${b64str}`;
  }

  // Build input content
  let input;

  if (previous_response_id && mask_image) {
    // Multi-turn with mask: send mask image + descriptive prompt
    const maskDataUrl = toDataUrl(mask_image);
    const maskPrompt = prompt + '\n\nThe attached image is an editing mask. White regions indicate areas to modify. Black regions must be preserved exactly as they are in the previous image.';
    input = [{
      role: 'user',
      content: [
        { type: 'input_image', image_url: maskDataUrl },
        { type: 'input_text', text: maskPrompt },
      ]
    }];
  } else if (previous_response_id && (input_image_2 || input_image_3 || input_image_4)) {
    // Multi-turn with additional reference images: source in context, attach new references
    const content = [];
    function addRefImage(b64str) {
      if (!b64str || b64str.length < 100) return;
      content.push({ type: 'input_image', image_url: toDataUrl(b64str) });
    }
    if (input_image_2) addRefImage(input_image_2);
    if (input_image_3) addRefImage(input_image_3);
    if (input_image_4) addRefImage(input_image_4);
    content.push({ type: 'input_text', text: prompt });
    input = [{ role: 'user', content }];
  } else if (previous_response_id) {
    // Multi-turn correction without mask: images already in context from previous response
    input = prompt;
  } else if (hasInputImage) {
    // First turn with image(s): include them in the user message
    const content = [];

    // Helper to add an image to content
    function addImage(b64str) {
      if (!b64str || b64str.length < 100) return;
      content.push({ type: 'input_image', image_url: toDataUrl(b64str) });
    }

    addImage(input_image);
    if (input_image_2) addImage(input_image_2);
    if (input_image_3) addImage(input_image_3);
    if (input_image_4) addImage(input_image_4);

    // When editing with an input image, reinforce that the product must be preserved exactly
    let enhancedPrompt = prompt;
    if (action === 'edit') {
      const isPhotoshoot = prompt.toLowerCase().includes('photoshoot') || prompt.toLowerCase().includes('product');
      if (isPhotoshoot && !prompt.includes('CRITICAL')) {
        enhancedPrompt = `IMPORTANT: The attached image shows the exact product. Preserve its exact design, shape, colors, stones, and proportions. Do not alter the product itself.\n\n${prompt}`;
      }
    }

    content.push({ type: 'input_text', text: enhancedPrompt });

    input = [{ role: 'user', content }];
  } else {
    // Text-only generation (no image, no previous turn)
    // Append quality suffix for better jewelry renders
    const lower = prompt.toLowerCase();
    const hasPhotoDir = lower.includes('photography') || lower.includes('photorealistic') || lower.includes('macro') || lower.includes('8k');
    input = hasPhotoDir ? prompt : prompt + '. Photorealistic luxury jewelry photography, soft studio lighting, sharp macro detail.';
  }

  // Build the tool configuration
  const toolConfig = {
    type: 'image_generation',
    quality,
    input_fidelity,
    size: resolvedSize,
    output_format: 'png',
  };

  // action: "edit" forces editing the input image
  // action: "generate" forces generating a new image
  // action: "auto" lets the model decide (default)
  // Force edit when mask is provided
  const effectiveAction = mask_image ? 'edit' : action;
  if (effectiveAction && effectiveAction !== 'auto') {
    toolConfig.action = effectiveAction;
  }

  const requestBody = {
    model: 'gpt-4.1',
    input,
    tools: [toolConfig],
  };

  if (previous_response_id) {
    requestBody.previous_response_id = previous_response_id;
  }

  const res = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers,
    body: JSON.stringify(requestBody),
  });

  let data;
  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    data = await res.json();
  } else {
    const text = await res.text();
    try { data = JSON.parse(text); } catch { throw new Error(`Responses API returned non-JSON (HTTP ${res.status}): ${text.slice(0, 200)}`); }
  }

  if (!res.ok) {
    throw new Error(data?.error?.message || `Responses API error: HTTP ${res.status}`);
  }

  // Extract the generated image from the response output
  const imageOutput = (data.output || []).find(o => o.type === 'image_generation_call');
  if (!imageOutput || !imageOutput.result) {
    const outputTypes = (data.output || []).map(o => o.type);
    console.error('No image in response. Output types:', outputTypes, 'Full output keys:', JSON.stringify(data.output || []).slice(0, 500));
    throw new Error('No image generated in response. Output types: ' + outputTypes.join(', '));
  }

  return {
    url: `data:image/png;base64,${imageOutput.result}`,
    mode: 'responses-api-' + (imageOutput.action || action || 'unknown'),
    response_id: data.id,
    action: imageOutput.action || action,
    revised_prompt: imageOutput.revised_prompt || null,
  };
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

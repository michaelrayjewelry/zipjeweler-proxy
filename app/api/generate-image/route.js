// app/api/generate-image/route.js
// OpenAI Responses API — image editing and generation with context
// Used by:
//   C2R: action="edit" — forces editing the input image (material conversion only)
//   S2I: action="auto" — model decides whether to generate or edit based on context
// Supports iterative corrections via previous_response_id

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
    input_image,            // base64 image (CAD screenshot or sketch)
    reference_images,       // optional array of base64 images (orientation guides, etc.)
    mask_image,             // mask for targeted editing (white = change, black = keep)
    previous_response_id,   // for multi-turn corrections
    action = 'auto',        // "edit" = force edit input image, "generate" = new image, "auto" = model decides
    quality = 'high',
    size = 'auto',
    input_fidelity = 'high',
  } = body;

  if (!prompt || prompt.trim().length < 5) {
    return Response.json({ error: 'prompt is required' }, { status: 400, headers: corsHeaders });
  }

  const openaiKey = process.env.OPENAI_API_KEY;
  if (!openaiKey) {
    return Response.json({ error: 'OPENAI_API_KEY not configured' }, { status: 500, headers: corsHeaders });
  }

  try {
    const result = await responsesGenerate({
      openaiKey,
      prompt: prompt.trim(),
      input_image,
      reference_images,
      mask_image,
      previous_response_id,
      action,
      quality,
      size,
      input_fidelity,
    });
    return Response.json(result, { headers: corsHeaders });
  } catch (e) {
    console.error('Responses API error:', e.message);
    return Response.json({ error: e.message }, { status: 500, headers: corsHeaders });
  }
}

async function responsesGenerate({ openaiKey, prompt, input_image, reference_images, mask_image, previous_response_id, action, quality, size, input_fidelity }) {
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${openaiKey}`,
  };

  // Build input content — image + text prompt
  let input;

  if (previous_response_id && mask_image) {
    // Multi-turn with mask: send mask image + descriptive prompt
    const maskDataUrl = mask_image.startsWith('data:')
      ? mask_image
      : `data:image/png;base64,${mask_image}`;
    const maskPrompt = prompt + '\n\nThe attached image is an editing mask. White regions indicate areas to modify. Black regions must be preserved exactly as they are in the previous image.';
    input = [{
      role: 'user',
      content: [
        { type: 'input_image', image_url: maskDataUrl },
        { type: 'input_text', text: maskPrompt },
      ]
    }];
  } else if (previous_response_id && Array.isArray(reference_images) && reference_images.length > 0) {
    // Multi-turn with reference images: source image in context, attach new references
    const contentItems = [];
    for (const refImg of reference_images) {
      if (!refImg) continue;
      const refUrl = refImg.startsWith('data:')
        ? refImg
        : `data:image/png;base64,${refImg}`;
      contentItems.push({ type: 'input_image', image_url: refUrl });
    }
    contentItems.push({ type: 'input_text', text: prompt });
    input = [{ role: 'user', content: contentItems }];
  } else if (previous_response_id) {
    // Multi-turn correction: image is already in context from the previous response
    input = prompt;
  } else if (input_image) {
    // First turn with an image: include it in the user message
    const dataUrl = input_image.startsWith('data:')
      ? input_image
      : `data:image/png;base64,${input_image}`;

    const contentItems = [
      {
        type: 'input_image',
        image_url: dataUrl,
      },
    ];

    // Append any reference images (orientation guides, etc.)
    if (Array.isArray(reference_images)) {
      for (const refImg of reference_images) {
        if (!refImg) continue;
        const refUrl = refImg.startsWith('data:')
          ? refImg
          : `data:image/png;base64,${refImg}`;
        contentItems.push({ type: 'input_image', image_url: refUrl });
      }
    }

    contentItems.push({
      type: 'input_text',
      text: prompt,
    });

    input = [{ role: 'user', content: contentItems }];
  } else {
    // Text-only (no image, no previous turn)
    input = prompt;
  }

  // Build the tool configuration
  const toolConfig = {
    type: 'image_generation',
    quality,
    input_fidelity,
    size,
  };

  // action: "edit" forces the model to edit the input image
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

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.error?.message || `Responses API error: HTTP ${res.status}`);
  }

  // Extract the generated image from the response output
  const imageOutput = (data.output || []).find(o => o.type === 'image_generation_call');
  if (!imageOutput || !imageOutput.result) {
    // Log full response for debugging
    console.error('No image in response. Output types:', (data.output || []).map(o => o.type));
    throw new Error('No image generated in response');
  }

  return {
    url: `data:image/png;base64,${imageOutput.result}`,
    mode: 'responses-api-' + (imageOutput.action || action || 'unknown'),
    response_id: data.id,
    action: imageOutput.action || action,
    revised_prompt: imageOutput.revised_prompt || null,
  };
}

export async function GET() {
  return Response.json(
    {
      status: 'ok',
      service: 'zipjeweler-responses-api',
      hasOpenAI: !!process.env.OPENAI_API_KEY,
      timestamp: new Date().toISOString(),
    },
    { headers: { 'Access-Control-Allow-Origin': '*' } }
  );
}

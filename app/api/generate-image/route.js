// app/api/generate-image/route.js
// OpenAI Responses API — multi-turn image generation with sketch reference
// Used by S2I (Sketch-to-Image) for high-fidelity sketch→render conversion
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
    input_image,           // base64 sketch image
    previous_response_id,  // for multi-turn corrections
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
      previous_response_id,
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

async function responsesGenerate({ openaiKey, prompt, input_image, previous_response_id, quality, size, input_fidelity }) {
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${openaiKey}`,
  };

  // Build input content
  const inputContent = [];

  // If we have a sketch image and this is the first turn (no previous response),
  // include it as an input_image in the user message
  if (input_image && !previous_response_id) {
    const dataUrl = input_image.startsWith('data:')
      ? input_image
      : `data:image/png;base64,${input_image}`;

    inputContent.push({
      role: 'user',
      content: [
        {
          type: 'input_image',
          image_url: dataUrl,
        },
        {
          type: 'input_text',
          text: prompt,
        },
      ],
    });
  } else {
    // Text-only input (either no image, or multi-turn where image is in context)
    inputContent.push({
      role: 'user',
      content: [
        {
          type: 'input_text',
          text: prompt,
        },
      ],
    });
  }

  // Build the request body
  const requestBody = {
    model: 'gpt-4.1',  // Mainline model that supports image_generation tool
    input: inputContent.length === 1 ? inputContent[0] : inputContent,
    tools: [{
      type: 'image_generation',
      quality,
      input_fidelity,
      size,
    }],
  };

  // For multi-turn corrections, chain to the previous response
  if (previous_response_id) {
    requestBody.previous_response_id = previous_response_id;
    // In multi-turn, input is just the correction text, not the full array
    requestBody.input = prompt;
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
    throw new Error('No image generated in response');
  }

  return {
    url: `data:image/png;base64,${imageOutput.result}`,
    mode: 'responses-api',
    response_id: data.id,  // Return for multi-turn chaining
    action: imageOutput.action || 'unknown',
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

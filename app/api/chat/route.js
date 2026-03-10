// app/api/chat/route.js
// Server-side proxy for Anthropic Messages API — keeps API key off the client

const ANTHROPIC_BASE = 'https://api.anthropic.com/v1/messages';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export async function OPTIONS() {
  return new Response(null, { status: 200, headers: corsHeaders });
}

export async function POST(request) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return Response.json(
      { error: 'ANTHROPIC_API_KEY not configured on server' },
      { status: 500, headers: corsHeaders }
    );
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json(
      { error: 'Invalid JSON body' },
      { status: 400, headers: corsHeaders }
    );
  }

  // Pass through the request to Anthropic — allow model, max_tokens, messages, system, etc.
  try {
    const res = await fetch(ANTHROPIC_BASE, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
    });

    const data = await res.json();

    return Response.json(data, {
      status: res.status,
      headers: corsHeaders,
    });
  } catch (e) {
    return Response.json(
      { error: 'Anthropic API error: ' + e.message },
      { status: 502, headers: corsHeaders }
    );
  }
}

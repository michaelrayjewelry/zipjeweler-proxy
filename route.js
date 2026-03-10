import { NextResponse } from 'next/server';

// ── Config ──────────────────────────────────────────────────────────
// Set FAL_API_KEY in Vercel → Settings → Environment Variables
const FAL_API_KEY = process.env.FAL_API_KEY || '';
const BASE = 'https://queue.fal.run';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

// ── OPTIONS (CORS preflight) ────────────────────────────────────────
export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

// ── POST handler ────────────────────────────────────────────────────
export async function POST(request) {
  if (!FAL_API_KEY) {
    return NextResponse.json(
      { error: 'FAL_API_KEY not configured. Add it in Vercel Environment Variables.' },
      { status: 500, headers: corsHeaders }
    );
  }

  let body;
  try {
    body = await request.json();
  } catch (e) {
    return NextResponse.json(
      { error: 'Invalid JSON body: ' + e.message },
      { status: 400, headers: corsHeaders }
    );
  }

  // Extract model and input from the request body
  // Expects: { model: "fal-ai/flux/dev", input: { prompt: "...", ... } }
  const model = body.model || 'fal-ai/flux/dev';
  const input = body.input || {};

  const AUTH = `Key ${FAL_API_KEY}`;

  // ── Step 1: Submit to fal.ai queue ──────────────────────────────
  let requestId;
  try {
    const submitRes = await fetch(`${BASE}/${model}`, {
      method: 'POST',
      headers: {
        'Authorization': AUTH,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(input),
    });

    const submitData = await submitRes.json();
    requestId = submitData?.request_id;

    if (!requestId) {
      return NextResponse.json(
        { error: 'No request_id from fal.ai', raw: submitData },
        { status: 500, headers: corsHeaders }
      );
    }
  } catch (e) {
    return NextResponse.json(
      { error: 'Submit error: ' + e.message },
      { status: 500, headers: corsHeaders }
    );
  }

  // ── Step 2: Poll for completion (up to 55s) ─────────────────────
  const deadline = Date.now() + 55000;
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 2500));

    try {
      const pollRes = await fetch(
        `${BASE}/${model}/requests/${requestId}/status`,
        { headers: { 'Authorization': AUTH } }
      );
      const pollData = await pollRes.json();
      const status = pollData?.status;

      if (status === 'completed' || status === 'succeeded' || status === 'COMPLETED') {
        // Fetch the actual result
        const resultRes = await fetch(
          `${BASE}/${model}/requests/${requestId}`,
          { headers: { 'Authorization': AUTH } }
        );
        const resultData = await resultRes.json();

        const url =
          resultData?.images?.[0]?.url ||
          resultData?.output?.images?.[0]?.url ||
          resultData?.image?.url ||
          resultData?.result?.images?.[0]?.url ||
          pollData?.result?.images?.[0]?.url ||
          null;

        if (!url) {
          return NextResponse.json(
            { error: 'Completed but no image URL found', raw: resultData },
            { status: 500, headers: corsHeaders }
          );
        }

        return NextResponse.json({ url, requestId }, { headers: corsHeaders });
      }

      if (status === 'failed' || status === 'error' || status === 'cancelled' || status === 'FAILED') {
        return NextResponse.json(
          { error: `Job ${status}`, raw: pollData },
          { status: 500, headers: corsHeaders }
        );
      }

      // Otherwise still IN_QUEUE or IN_PROGRESS — keep polling
    } catch (e) {
      return NextResponse.json(
        { error: 'Poll error: ' + e.message },
        { status: 500, headers: corsHeaders }
      );
    }
  }

  return NextResponse.json(
    { error: 'Timed out after 55s. Try again.', requestId },
    { status: 504, headers: corsHeaders }
  );
}

// ── GET (health check) ─────────────────────────────────────────────
export async function GET() {
  return NextResponse.json(
    {
      status: 'ok',
      service: 'zipjeweler-proxy',
      hasApiKey: !!FAL_API_KEY,
      timestamp: new Date().toISOString(),
    },
    { headers: corsHeaders }
  );
}

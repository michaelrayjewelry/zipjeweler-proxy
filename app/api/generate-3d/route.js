// app/api/generate-3d/route.js
// Next.js App Router API route — Meshy.ai Image-to-3D generation
// Supports: submit task, poll status, retrieve model URLs

const MESHY_BASE = 'https://api.meshy.ai/openapi/v2';

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

  const meshyKey = process.env.MESHY_API_KEY;
  if (!meshyKey) {
    return Response.json(
      { error: 'MESHY_API_KEY not configured on server' },
      { status: 500, headers: corsHeaders }
    );
  }

  let body;
  try { body = await request.json(); } catch { body = {}; }

  const { action } = body;

  // Route to the appropriate handler
  if (action === 'create') {
    return handleCreate(body, meshyKey, corsHeaders);
  } else if (action === 'poll') {
    return handlePoll(body, meshyKey, corsHeaders);
  } else {
    return Response.json(
      { error: 'Invalid action. Use "create" or "poll".' },
      { status: 400, headers: corsHeaders }
    );
  }
}

// ────────────────────────────────────────────────────────────
// Create a new Image-to-3D task
// ────────────────────────────────────────────────────────────
async function handleCreate(body, meshyKey, corsHeaders) {
  const {
    image_url,            // base64 data URI or URL
    topology = 'quad',    // "quad" or "triangle"
    target_polycount = 30000,
    enable_pbr = true,
  } = body;

  if (!image_url) {
    return Response.json(
      { error: 'image_url is required (base64 data URI or URL)' },
      { status: 400, headers: corsHeaders }
    );
  }

  const payload = {
    image_url,
    enable_pbr,
    should_remesh: true,
    topology,
    target_polycount,
  };

  try {
    const res = await fetch(`${MESHY_BASE}/image-to-3d`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${meshyKey}`,
      },
      body: JSON.stringify(payload),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data?.message || data?.error || `Meshy API error: HTTP ${res.status}`);
    }

    // Meshy returns { result: "task_id" }
    return Response.json(
      { task_id: data.result },
      { headers: corsHeaders }
    );
  } catch (e) {
    return Response.json(
      { error: e.message },
      { status: 502, headers: corsHeaders }
    );
  }
}

// ────────────────────────────────────────────────────────────
// Poll an existing task for status and results
// ────────────────────────────────────────────────────────────
async function handlePoll(body, meshyKey, corsHeaders) {
  const { task_id } = body;

  if (!task_id) {
    return Response.json(
      { error: 'task_id is required for polling' },
      { status: 400, headers: corsHeaders }
    );
  }

  try {
    const res = await fetch(`${MESHY_BASE}/image-to-3d/${task_id}`, {
      headers: {
        'Authorization': `Bearer ${meshyKey}`,
      },
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data?.message || data?.error || `Meshy API error: HTTP ${res.status}`);
    }

    return Response.json(
      {
        status: data.status,            // PENDING, IN_PROGRESS, SUCCEEDED, FAILED, EXPIRED
        progress: data.progress || 0,   // 0-100
        model_urls: data.model_urls || null,
        thumbnail_url: data.thumbnail_url || null,
        texture_urls: data.texture_urls || null,
        task_error: data.task_error || null,
      },
      { headers: corsHeaders }
    );
  } catch (e) {
    return Response.json(
      { error: e.message },
      { status: 502, headers: corsHeaders }
    );
  }
}

export async function GET() {
  return Response.json(
    {
      status: 'ok',
      service: 'meshy-3d-proxy',
      hasMeshy: !!process.env.MESHY_API_KEY,
      timestamp: new Date().toISOString(),
    },
    {
      headers: { 'Access-Control-Allow-Origin': '*' },
    }
  );
}

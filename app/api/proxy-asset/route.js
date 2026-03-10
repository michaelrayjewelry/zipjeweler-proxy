// app/api/proxy-asset/route.js
// Proxies external asset URLs (GLB, FBX, etc.) to avoid CORS issues
// model-viewer fetches GLB via JS fetch which requires CORS headers

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const url = searchParams.get('url');

  if (!url) {
    return new Response('Missing url parameter', { status: 400 });
  }

  // Only allow proxying from known trusted domains (Meshy CDN)
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return new Response('Invalid URL', { status: 400 });
  }

  const allowedHosts = ['assets.meshy.ai', 'cdn.meshy.ai', 'meshy.ai'];
  if (!allowedHosts.some(h => parsed.hostname === h || parsed.hostname.endsWith('.' + h))) {
    return new Response('Domain not allowed', { status: 403 });
  }

  try {
    const res = await fetch(url);
    if (!res.ok) {
      return new Response(`Upstream error: ${res.status}`, { status: 502 });
    }

    const contentType = res.headers.get('content-type') || 'application/octet-stream';
    const body = await res.arrayBuffer();

    return new Response(body, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=86400',
      },
    });
  } catch (e) {
    return new Response('Proxy fetch failed: ' + e.message, { status: 502 });
  }
}

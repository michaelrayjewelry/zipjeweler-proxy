# ZipJeweler Proxy

Serverless proxy for fal.ai image generation, deployed on Vercel via Next.js App Router.

## File Structure

```
zipjeweler-proxy/
├── app/
│   ├── api/
│   │   └── generate-render/
│   │       └── route.js          ← The actual proxy logic
│   ├── layout.js                 ← Required by Next.js App Router
│   └── page.js                   ← Health/landing page
├── .gitignore
├── next.config.js
├── package.json                  ← Must list "next" as dependency
└── README.md
```

## Setup

### 1. Push to GitHub

Upload all files to your `zipjeweler-proxy` repo. **Delete any old files** at the root level like `api/generate-render.js` or `generate-render.js` — those don't work with Next.js App Router.

### 2. Configure Vercel

1. Go to [vercel.com](https://vercel.com) → your `zipjeweler-proxy` project
2. **Settings → General → Framework Preset** → make sure it says **Next.js**
3. **Settings → Environment Variables** → add:
   - Key: `FAL_API_KEY`
   - Value: your fal.ai API key
4. **Redeploy** (Deployments tab → click "..." on latest → Redeploy)

### 3. Test

```bash
# Health check
curl https://zipjeweler-proxy.vercel.app/api/generate-render

# Generate an image
curl -X POST https://zipjeweler-proxy.vercel.app/api/generate-render \
  -H "Content-Type: application/json" \
  -d '{
    "model": "fal-ai/flux/dev",
    "input": {
      "prompt": "Fine jewelry product photo, 14k gold solitaire diamond ring, studio lighting",
      "image_size": "square_hd"
    }
  }'
```

## API

### `POST /api/generate-render`

**Request:**
```json
{
  "model": "fal-ai/flux/dev",
  "input": {
    "prompt": "your prompt here",
    "image_size": "square_hd"
  }
}
```

**Response (success):**
```json
{
  "url": "https://fal.media/files/...",
  "requestId": "abc-123"
}
```

### `GET /api/generate-render`

Returns health status and whether the API key is configured.

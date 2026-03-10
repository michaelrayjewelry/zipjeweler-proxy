# ZipJeweler Render Proxy

Vercel serverless function that proxies Higgsfield FLUX image generation
for the ZipJeweler investor report preview tools.

Claude (Anthropic) handles all text/analysis directly from the browser.
This proxy exists solely to give Higgsfield a server-side home — their
SDK explicitly blocks browser calls.

---

## Files

```
zipjeweler-proxy/
├── api/
│   └── generate-render.mjs  ← the only serverless function
├── package.json
├── vercel.json              ← CORS headers + 60s timeout
└── README.md
```

---

## Deploy (step by step)

### 1. Get your Higgsfield keys
- Go to https://cloud.higgsfield.ai
- Sign in → Settings → API Keys
- Create a new key — you'll get a KEY_ID and a KEY_SECRET
- Save both immediately (secret is shown once)

### 2. Push this folder to GitHub
```bash
cd zipjeweler-proxy
git init
git add .
git commit -m "initial"
# Create a new repo on github.com called zipjeweler-proxy
git remote add origin https://github.com/YOUR_USERNAME/zipjeweler-proxy.git
git push -u origin main
```

### 3. Create the Vercel project
- Go to https://vercel.com → Add New Project
- Import your zipjeweler-proxy GitHub repo
- Framework Preset: **Other** (not Next.js)
- Root directory: leave as `/`
- Click Deploy

### 4. Add environment variables
In your Vercel project → Settings → Environment Variables, add:

| Name                    | Value              | Environment        |
|-------------------------|--------------------|--------------------|
| HIGGSFIELD_KEY_ID       | your key ID        | Production, Preview, Development |
| HIGGSFIELD_KEY_SECRET   | your key secret    | Production, Preview, Development |

Then go to Deployments → click the 3-dot menu on your latest deploy → **Redeploy**
(env vars only take effect after a redeploy)

### 5. Note your proxy URL
It will be:  https://zipjeweler-proxy.vercel.app/api/generate-render
(or whatever Vercel names it)

---

## Test it

```bash
curl -X POST https://zipjeweler-proxy.vercel.app/api/generate-render \
  -H "Content-Type: application/json" \
  -d '{"prompt":"18k white gold oval engagement ring with pavé diamond halo, white studio background, macro jewelry photography"}'
```

Should return:
```json
{ "url": "https://..." }
```

---

## Plug it into the report

In zipjeweler-investor-report-MG3.html, find the line:
```
const PROXY_URL = '';
```
And set it to your Vercel URL:
```
const PROXY_URL = 'https://zipjeweler-proxy.vercel.app/api/generate-render';
```

That's it — all three render panels (Imagine, Sketch to Image, CAD to Render)
will fire live image generation.

---

## Cost

Higgsfield FLUX charges per generation. Check current pricing at:
https://cloud.higgsfield.ai/pricing

Claude API calls (analysis, chat) go directly browser → Anthropic and
are not routed through this proxy.

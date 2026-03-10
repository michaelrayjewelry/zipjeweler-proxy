// app/api/config/route.js
// Reports which server-side API keys are configured (not the keys themselves)

export async function GET() {
  return Response.json(
    {
      hasAnthropicKey: !!process.env.ANTHROPIC_API_KEY,
      hasOpenAI: !!process.env.OPENAI_API_KEY,
      hasHiggsfield: !!(process.env.HIGGSFIELD_KEY_ID && process.env.HIGGSFIELD_KEY_SECRET),
    },
    {
      headers: { 'Access-Control-Allow-Origin': '*' },
    }
  );
}

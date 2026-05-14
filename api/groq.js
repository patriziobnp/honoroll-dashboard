import { requireAuth } from "./_auth.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  // Require a valid Supabase JWT — proxy is not an open Groq gateway
  const user = await requireAuth(req);
  if (!user) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  const { system, user: userMsg, max_tokens = 4096, temperature = 0.7, model } = req.body;
  if (!system || !userMsg) {
    return res.status(400).json({ error: "Missing system or user message" });
  }
  if (!process.env.GROQ_API_KEY) {
    return res.status(500).json({ error: "GROQ_API_KEY not configured on server" });
  }

  // Whitelist allowed models to prevent the proxy being used as an open Groq gateway
  const ALLOWED_MODELS = ["llama-3.3-70b-versatile", "llama-3.1-8b-instant"];
  const chosenModel = ALLOWED_MODELS.includes(model) ? model : "llama-3.3-70b-versatile";

  const body = JSON.stringify({
    model: chosenModel,
    messages: [
      { role: "system", content: system },
      { role: "user", content: userMsg },
    ],
    max_tokens,
    temperature,
  });

  // Retry on 429 with backoff. Groq returns Retry-After (seconds) when available.
  const maxAttempts = 3;
  let lastResponse = null;
  let lastErrText = "";
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${process.env.GROQ_API_KEY}`,
        },
        body,
      });
      if (response.ok) {
        const data = await response.json();
        const text = data.choices?.[0]?.message?.content || "";
        return res.status(200).json({ text });
      }
      lastResponse = response;
      lastErrText = await response.text().catch(() => "");
      if (response.status !== 429 || attempt === maxAttempts - 1) break;
      const retryAfterRaw = response.headers.get("retry-after");
      const retryAfterSec = retryAfterRaw ? parseFloat(retryAfterRaw) : NaN;
      const waitMs = Number.isFinite(retryAfterSec)
        ? Math.min(retryAfterSec * 1000, 20000)
        : Math.min(2000 * Math.pow(2, attempt), 8000);
      await new Promise((r) => setTimeout(r, waitMs));
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }
  const status = lastResponse?.status || 500;
  if (status === 429) {
    return res.status(429).json({
      error: "Rate limit reached for the AI model. Please wait 30–60 seconds before trying again.",
      raw: lastErrText,
    });
  }
  return res.status(status).json({ error: lastErrText });
}

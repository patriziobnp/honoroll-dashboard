import { requireAuth, checkRateLimit } from "./_auth.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  // Require a valid Supabase JWT — proxy is not an open Groq gateway
  const user = await requireAuth(req);
  if (!user) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  // Per-user rate limit (30 calls/min) prevents a single signed-in user from
  // draining the Groq quota by looping the generators.
  const limited = checkRateLimit(user.id, { max: 30, windowMs: 60_000 });
  if (limited) {
    res.setHeader("Retry-After", String(limited.retryAfter));
    return res.status(429).json({
      error: `Too many requests. Please wait ${limited.retryAfter}s before generating again.`,
    });
  }
  const { system, user: userMsg, max_tokens = 4096, temperature = 0.7, model } = req.body;
  if (!system || !userMsg) {
    return res.status(400).json({ error: "Missing system or user message" });
  }
  if (!process.env.GROQ_API_KEY) {
    return res.status(500).json({ error: "GROQ_API_KEY not configured on server" });
  }

  // Whitelist allowed models to prevent the proxy being used as an open Groq gateway
  // llama-3.3-70b-versatile + llama-3.1-8b-instant were deprecated on Groq
  // 2026-06-17; Groq's own recommended replacements are the gpt-oss models.
  const ALLOWED_MODELS = ["openai/gpt-oss-120b", "openai/gpt-oss-20b"];
  const chosenModel = ALLOWED_MODELS.includes(model) ? model : "openai/gpt-oss-120b";

  // gpt-oss are reasoning models: hidden reasoning tokens count against
  // max_tokens, and with our long content prompts they could exhaust the whole
  // budget and return empty content. Keep reasoning low and give the completion
  // headroom above what the client asked for its visible output.
  const body = JSON.stringify({
    model: chosenModel,
    messages: [
      { role: "system", content: system },
      { role: "user", content: userMsg },
    ],
    max_tokens: Math.min(Number(max_tokens) + 4096, 16384),
    temperature,
    reasoning_effort: "low",
    include_reasoning: false,
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
        const choice = data.choices?.[0] || {};
        const text = (choice.message?.content || "").trim();
        if (!text) {
          const why = choice.finish_reason === "length"
            ? "the model hit its token limit before producing output"
            : `finish_reason=${choice.finish_reason || "unknown"}`;
          return res.status(502).json({ error: `AI returned an empty response (${why}). Try again or switch model in Settings.` });
        }
        return res.status(200).json({ text, finish_reason: choice.finish_reason || null });
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

import { requireAuth } from "./_auth.js";

// PageSpeed/Lighthouse runs are slow (15-30s typical). Override Vercel's
// 10s default function timeout so the call has room to finish.
export const config = { maxDuration: 60 };

// PageSpeed Insights proxy. Routes the Google API call through the server so
// we can (1) require a Supabase JWT (no anonymous abuse), (2) attach a key
// when one is configured to lift the anonymous-tier quota, and (3) cache the
// result at the edge.
export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  const user = await requireAuth(req);
  if (!user) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  const { domain } = req.query;
  if (!domain) {
    return res.status(400).json({ error: "Missing domain parameter" });
  }
  // Same allowlist as /api/seo to prevent SSRF via crafted hosts
  if (typeof domain !== "string" || domain.length > 253 || !/^[A-Za-z0-9.-]+$/.test(domain)) {
    return res.status(400).json({ error: "Invalid domain" });
  }
  const key = process.env.PAGESPEED_API_KEY;
  const params = new URLSearchParams({
    url: `https://${domain}`,
    category: "performance",
  });
  params.append("category", "seo");
  params.append("category", "accessibility");
  if (key) params.set("key", key);
  try {
    const response = await fetch(`https://www.googleapis.com/pagespeedonline/v5/runPagespeed?${params.toString()}`);
    if (!response.ok) {
      const errText = await response.text();
      return res.status(response.status).json({ error: errText.slice(0, 500) });
    }
    const data = await response.json();
    // Edge cache for 1h — the dashboard also caches client-side for 24h
    res.setHeader("Cache-Control", "s-maxage=3600, stale-while-revalidate=86400");
    res.status(200).json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

import { requireAuth } from "./_auth.js";

// PageSpeed/Lighthouse runs are slow (15-30s typical) and occasionally flake.
// Override Vercel's 10s default function timeout so we have room to retry once.
export const config = { maxDuration: 60 };

// PageSpeed Insights proxy. Routes the Google API call through the server so
// we can (1) require a Supabase JWT (no anonymous abuse), (2) attach a key
// when one is configured to lift the anonymous-tier quota, (3) cache the
// result at the edge, and (4) auto-retry on transient Lighthouse failures
// (FAILED_DOCUMENT_REQUEST, NO_FCP, etc) so most flakes are invisible to users.
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
  const psiUrl = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?${params.toString()}`;

  // Treat these as transient Lighthouse errors worth retrying once. Quota /
  // permission errors are NOT in this set — those would just waste another
  // call. Real 5xx from Google API also retry.
  const TRANSIENT_PATTERNS = /FAILED_DOCUMENT_REQUEST|NO_FCP|NO_LCP|LIGHTHOUSE_ERROR|PROTOCOL_TIMEOUT|UNKNOWN_ERROR|ERRORED_DOCUMENT_REQUEST|DNS_FAILURE|NO_DOCUMENT_REQUEST/i;
  const maxAttempts = 2;
  let lastErrText = "";
  let lastStatus = 0;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const response = await fetch(psiUrl);
      if (response.ok) {
        const data = await response.json();
        res.setHeader("Cache-Control", "s-maxage=3600, stale-while-revalidate=86400");
        return res.status(200).json(data);
      }
      lastStatus = response.status;
      lastErrText = await response.text().catch(() => "");
      const transient = response.status >= 500 || TRANSIENT_PATTERNS.test(lastErrText);
      if (!transient || attempt === maxAttempts - 1) break;
      // Short delay before retry
      await new Promise((r) => setTimeout(r, 1500));
    } catch (e) {
      lastErrText = e.message;
      lastStatus = 500;
      if (attempt === maxAttempts - 1) break;
      await new Promise((r) => setTimeout(r, 1500));
    }
  }
  return res.status(lastStatus || 500).json({ error: lastErrText.slice(0, 500) });
}

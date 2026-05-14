import { requireAuth } from "./_auth.js";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  // Require a valid Supabase JWT — proxy must not be a public Umami gateway
  const user = await requireAuth(req);
  if (!user) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  const { path, region } = req.query;
  if (!path) {
    return res.status(400).json({ error: "Missing path parameter" });
  }
  if (!process.env.UMAMI_API_KEY) {
    return res.status(500).json({ error: "UMAMI_API_KEY not configured on server" });
  }
  // Whitelist: only allow paths starting with /websites/
  if (!path.startsWith("/websites/")) {
    return res.status(400).json({ error: "Invalid path" });
  }
  try {
    const base = `https://api.umami.is/v1${region ? `/${region}` : ""}`;
    const response = await fetch(`${base}${path}`, {
      headers: {
        "Accept": "application/json",
        "x-umami-api-key": process.env.UMAMI_API_KEY,
      },
    });
    if (!response.ok) {
      const errText = await response.text();
      return res.status(response.status).json({ error: errText });
    }
    const data = await response.json();
    res.setHeader("Cache-Control", "s-maxage=60, stale-while-revalidate=120");
    res.status(200).json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

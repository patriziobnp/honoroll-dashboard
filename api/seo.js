export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  const { domain } = req.query;
  if (!domain) {
    return res.status(400).json({ error: "Missing domain parameter" });
  }
  if (!process.env.SEO_SCORE_API_KEY) {
    return res.status(500).json({ error: "SEO_SCORE_API_KEY not configured on server" });
  }
  try {
    const response = await fetch(`https://seoscoreapi.com/audit?url=https://${encodeURIComponent(domain)}`, {
      headers: {
        "X-API-Key": process.env.SEO_SCORE_API_KEY,
      },
    });
    if (!response.ok) {
      const errText = await response.text();
      return res.status(response.status).json({ error: errText });
    }
    const data = await response.json();
    res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=600");
    res.status(200).json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

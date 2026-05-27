import crypto from "crypto";
import { requireAuth } from "./_auth.js";

// Posting can involve a media upload + a tweet create round-trip; give it room.
export const config = { maxDuration: 30 };

// RFC-3986 percent-encoding (encodeURIComponent + the four extra chars).
const pct = (s) => encodeURIComponent(String(s)).replace(/[!*'()]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase());

// Build an OAuth 1.0a "Authorization: OAuth ..." header for a request.
// `extraParams` are signed params (query/form). JSON and multipart bodies are
// NOT part of the signature base string, so for those endpoints pass {}.
function oauthHeader(method, url, creds, extraParams = {}) {
  const oauth = {
    oauth_consumer_key: creds.apiKey,
    oauth_nonce: crypto.randomBytes(16).toString("hex"),
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_token: creds.accessToken,
    oauth_version: "1.0",
  };
  const signParams = { ...oauth, ...extraParams };
  const paramString = Object.keys(signParams).sort()
    .map((k) => `${pct(k)}=${pct(signParams[k])}`).join("&");
  const baseString = [method.toUpperCase(), pct(url), pct(paramString)].join("&");
  const signingKey = `${pct(creds.apiSecret)}&${pct(creds.accessTokenSecret)}`;
  oauth.oauth_signature = crypto.createHmac("sha1", signingKey).update(baseString).digest("base64");
  return "OAuth " + Object.keys(oauth).sort()
    .map((k) => `${pct(k)}="${pct(oauth[k])}"`).join(", ");
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  // Require a valid Supabase JWT — posting is a privileged action
  const user = await requireAuth(req);
  if (!user) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  const { text, mediaUrl } = req.body || {};
  if (!text || !String(text).trim()) {
    return res.status(400).json({ error: "Tweet text is required" });
  }
  const creds = {
    apiKey: process.env.X_API_KEY,
    apiSecret: process.env.X_API_SECRET,
    accessToken: process.env.X_ACCESS_TOKEN,
    accessTokenSecret: process.env.X_ACCESS_TOKEN_SECRET,
  };
  if (!creds.apiKey || !creds.apiSecret || !creds.accessToken || !creds.accessTokenSecret) {
    return res.status(500).json({ error: "X API credentials are not configured on the server" });
  }

  try {
    let mediaIds = [];

    // ── 1. Optional media upload (v1.1 chunked-less simple upload) ──
    if (mediaUrl) {
      const imgRes = await fetch(mediaUrl);
      if (!imgRes.ok) {
        throw new Error("Could not fetch the attached image (the link may have expired — reload and retry)");
      }
      const contentType = imgRes.headers.get("content-type") || "image/png";
      const buf = Buffer.from(await imgRes.arrayBuffer());
      if (buf.length > 5 * 1024 * 1024) {
        throw new Error("Image exceeds X's 5MB limit for this upload method");
      }
      const uploadUrl = "https://upload.twitter.com/1.1/media/upload.json";
      const boundary = "----honoroll" + crypto.randomBytes(8).toString("hex");
      const pre = Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="media"; filename="image"\r\nContent-Type: ${contentType}\r\n\r\n`);
      const tail = Buffer.from(`\r\n--${boundary}--\r\n`);
      const body = Buffer.concat([pre, buf, tail]);
      // multipart body is excluded from the OAuth signature base string
      const upAuth = oauthHeader("POST", uploadUrl, creds, {});
      const upRes = await fetch(uploadUrl, {
        method: "POST",
        headers: { Authorization: upAuth, "Content-Type": `multipart/form-data; boundary=${boundary}` },
        body,
      });
      const upText = await upRes.text();
      if (!upRes.ok) {
        throw new Error(`Media upload failed (${upRes.status}): ${upText.slice(0, 200)}`);
      }
      let upJson = {};
      try { upJson = JSON.parse(upText); } catch (e) {}
      if (upJson.media_id_string) mediaIds.push(upJson.media_id_string);
      else throw new Error("Media upload returned no media id");
    }

    // ── 2. Create the tweet (v2, JSON body — excluded from signature) ──
    const tweetUrl = "https://api.twitter.com/2/tweets";
    const tweetBody = mediaIds.length ? { text, media: { media_ids: mediaIds } } : { text };
    const tAuth = oauthHeader("POST", tweetUrl, creds, {});
    const tRes = await fetch(tweetUrl, {
      method: "POST",
      headers: { Authorization: tAuth, "Content-Type": "application/json" },
      body: JSON.stringify(tweetBody),
    });
    const tText = await tRes.text();
    if (!tRes.ok) {
      let msg = tText.slice(0, 300);
      try {
        const j = JSON.parse(tText);
        msg = j.detail || j.title || (j.errors && j.errors[0] && (j.errors[0].message || j.errors[0].detail)) || msg;
      } catch (e) {}
      if (tRes.status === 429) msg = "X rate limit reached. Please wait a bit and try again.";
      if (tRes.status === 403 && /duplicate/i.test(tText)) msg = "X rejected this as a duplicate of a recent post.";
      if (tRes.status === 401) msg = "X authentication failed — check the API credentials in Vercel.";
      return res.status(tRes.status).json({ error: msg });
    }
    let tJson = {};
    try { tJson = JSON.parse(tText); } catch (e) {}
    const id = tJson.data && tJson.data.id;
    const handle = process.env.X_USERNAME;
    const url = id ? `https://x.com/${handle || "i/web"}/status/${id}` : null;
    return res.status(200).json({ id: id || null, url });
  } catch (e) {
    return res.status(500).json({ error: e.message || "Failed to post to X" });
  }
}

// Shared auth helper for serverless proxies. Validates the caller's Supabase
// JWT by calling /auth/v1/user — returns the user object on success, or null.
// Files prefixed with _ are not routed as endpoints by Vercel.

const SUPABASE_URL = process.env.SUPABASE_URL || "https://zzxmpemfozerswguzoaz.supabase.co";
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || "sb_publishable_ls5mvx1mB_Wib4dhfxK8hQ__lpZ75w8";

// Best-effort per-user rate limiter. In-memory, per serverless instance —
// adequate at small scale (invitation-only beta). Returns `null` when the
// request is within budget, or a `{retryAfter}` object when the user has
// hit the limit. Calls share a single Map keyed by user.id, and entries
// auto-expire one window after their last use to bound memory growth.
const RATE_LIMITS = new Map(); // key=userId -> {count, windowStart}
export function checkRateLimit(userId, { max = 30, windowMs = 60_000 } = {}) {
  const now = Date.now();
  const entry = RATE_LIMITS.get(userId);
  if (!entry || now - entry.windowStart >= windowMs) {
    RATE_LIMITS.set(userId, { count: 1, windowStart: now });
    return null;
  }
  if (entry.count >= max) {
    const retryAfter = Math.ceil((windowMs - (now - entry.windowStart)) / 1000);
    return { retryAfter: Math.max(1, retryAfter) };
  }
  entry.count += 1;
  return null;
}

export async function requireAuth(req) {
  const auth = (req.headers.authorization || req.headers.Authorization || "").toString();
  if (!auth.startsWith("Bearer ")) return null;
  const token = auth.slice(7).trim();
  if (!token) return null;
  try {
    const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: SUPABASE_ANON_KEY,
      },
    });
    if (!r.ok) return null;
    const user = await r.json();
    return user && user.id ? user : null;
  } catch (e) {
    return null;
  }
}

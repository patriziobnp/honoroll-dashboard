// Shared auth helper for serverless proxies. Validates the caller's Supabase
// JWT by calling /auth/v1/user — returns the user object on success, or null.
// Files prefixed with _ are not routed as endpoints by Vercel.

const SUPABASE_URL = process.env.SUPABASE_URL || "https://zzxmpemfozerswguzoaz.supabase.co";
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || "sb_publishable_ls5mvx1mB_Wib4dhfxK8hQ__lpZ75w8";

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

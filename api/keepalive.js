// Keep-alive ping that prevents Supabase's free-tier 7-day inactivity pause.
// Vercel Cron fires this once a day; the function makes one trivial REST call
// to the Supabase project, which Supabase counts as activity. RLS makes the
// query return [] for the anon role — we don't need (and don't want) any data
// back, only the request itself.
//
// If CRON_SECRET is set in Vercel env, this endpoint requires the matching
// Authorization: Bearer header (Vercel Cron adds this header automatically).
// If not set, the endpoint is callable by anyone, which is fine: the worst
// they can do is keep the project awake.

const SUPABASE_URL = process.env.SUPABASE_URL || "https://zzxmpemfozerswguzoaz.supabase.co";
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || "sb_publishable_ls5mvx1mB_Wib4dhfxK8hQ__lpZ75w8";

export default async function handler(req, res) {
  const expected = process.env.CRON_SECRET;
  if (expected) {
    const auth = (req.headers.authorization || "").toString();
    if (auth !== `Bearer ${expected}`) {
      return res.status(401).json({ ok: false, error: "Unauthorized" });
    }
  }
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/user_settings?select=user_id&limit=1`, {
      headers: { apikey: SUPABASE_ANON_KEY, Accept: "application/json" },
    });
    return res.status(200).json({
      ok: true,
      supabase_status: r.status,
      timestamp: new Date().toISOString(),
    });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
}

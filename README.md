# Honoroll Dashboard

Single-page React analytics + AI content generation dashboard for Honoroll. Closed beta, invitation-only.

## Features

- **Magic-link auth** — passwordless email login, invitation-only via Supabase
- **Analytics** — Umami Cloud integration with KPIs, traffic charts, geographic breakdown, top pages, referrers, devices, browsers, OS, events, channels
- **AI Insights** — Trend analysis with severity-coded findings, "Provide more context" deep-dives, marketing suggestions across content/ads/social/email
- **Site Health** — Google PageSpeed Insights + SEO Score API audit
- **Content** — AI-generated X posts (3 variants), threads (3-8 tweets), articles (300-1200 words) with custom tone, length, emoji picker
- **Content Calendar** — Week/month views, X-style preview, schedule with date highlight, per-entry image uploads (Supabase Storage)
- **UTM Builder** — 3-field UTM link generator (source / medium / campaign) with templates, history, search, and filter
- **Settings** — Context Files (5 categories: Voice, Product, Audience, Campaign, Examples), Brand Assets with image uploads, Integrations, Site, Defaults
- **All user data persisted to Supabase** with row-level security; cross-device sync via account

## Architecture

- **Frontend:** Single `index.html` with React 18 + Recharts + Supabase JS via CDN, Babel standalone
- **Backend:** Three Vercel serverless proxies in `/api/` that hold API keys server-side
  - `/api/groq` — Llama 3.3 70B for AI features
  - `/api/umami` — Umami Cloud analytics
  - `/api/seo` — SEO Score API audit
- **Auth + Data + Storage:** Supabase (Postgres + Auth + Storage)
  - Tables: `context_files`, `utm_links`, `user_settings`, `calendar_entries`, `brand_assets`
  - Buckets: `brand-assets`, `calendar-images` (private, RLS-scoped to user UID folder)
  - Auth: magic links only, signups disabled (invitation-only)

## Setup

### 1. Push to GitHub

```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin git@github.com:patriziobnp/honoroll-dashboard.git
git push -u origin main
```

### 2. Deploy to Vercel

1. Go to [vercel.com/new](https://vercel.com/new)
2. Import your GitHub repository
3. Click Deploy (no build configuration needed — it's static)

### 3. Set Environment Variables

In Vercel project settings → **Environment Variables**, add:

| Variable | Value |
|---|---|
| `UMAMI_API_KEY` | Your Umami Cloud API key |
| `GROQ_API_KEY` | Your Groq API key |
| `SEO_SCORE_API_KEY` | Your SEO Score API key |

Then redeploy (Settings → Deployments → Redeploy) so the env vars take effect.

Supabase credentials (URL + anon key) are baked into `index.html` — they're public-safe; security comes from RLS.

### 4. Configure Supabase Auth Redirect URL

In Supabase Dashboard → Authentication → URL Configuration:
- **Site URL:** `https://<your-vercel-domain>.vercel.app`
- **Additional Redirect URLs:** include both the Vercel domain and `http://localhost:3000` for local dev

### 5. Invite Users

In Supabase Dashboard → Authentication → Users → **Invite user** with their email.

## Local Development

```bash
npm install -g vercel
vercel dev
```

Or serve `index.html` via `python3 -m http.server` if you only need to test the frontend (analytics proxies won't work). You'll need a `.env.local` for the proxies.

## Customizing

- **Site name and domain** — currently hardcoded in `index.html`. Look for `MOCK_SITE` at the bottom of the script tag.
- **Mock vs Live data** — `USE_MOCK = false` means the dashboard tries to fetch real analytics from Umami. Set to `true` to use mock data for development.

## Auto-Deploy

Every `git push` to the `main` branch automatically deploys to Vercel.

## File Structure

```
honoroll-dashboard/
├── api/
│   ├── groq.js          # AI generation proxy
│   ├── umami.js         # Analytics proxy
│   └── seo.js           # SEO audit proxy
├── index.html           # Frontend (React + Recharts + Supabase JS inline)
├── vercel.json          # Vercel config
├── .env.example         # Required env vars
├── .gitignore
├── CLAUDE.md            # Project context for Claude
└── README.md            # This file
```

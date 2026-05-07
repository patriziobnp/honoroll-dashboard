# Honoroll Dashboard

Single-page React analytics + AI content generation dashboard for Honoroll.

## Features

- **Analytics** — Umami Cloud integration with KPIs, traffic charts, geographic breakdown, top pages, referrers, devices, browsers, OS, events, channels
- **AI Insights** — Trend analysis with severity-coded findings, "Provide more context" deep-dives, marketing suggestions across content/ads/social/email
- **Site Health** — Google PageSpeed Insights + SEO Score API audit
- **Content** — AI-generated X posts (3 variants), threads (3-8 tweets), articles (300-1200 words) with custom tone, length, emoji picker
- **Content Calendar** — Week/month views, X-style preview, schedule with date highlight, image uploads per entry
- **UTM Builder** — 3-field UTM link generator (source / medium / campaign) with templates, history, search, and filter
- **Settings** — Context Files panel (5 categories: Voice, Product, Audience, Campaign, Examples), Brand Assets, Integrations, Site, Defaults

## Architecture

- **Frontend:** Single `index.html` with React 18 + Recharts via CDN, Babel standalone
- **Backend:** Three Vercel serverless proxies in `/api/` that hold API keys server-side
  - `/api/groq` — Llama 3.3 70B for AI features
  - `/api/umami` — Umami Cloud analytics
  - `/api/seo` — SEO Score API audit

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

## Local Development

```bash
npm install -g vercel
vercel dev
```

Then open the local URL Vercel provides. You'll need a `.env.local` file with the same variables as `.env.example`.

## Customizing

- **Site name and domain** — currently hardcoded in `index.html`. Look for `MOCK_SITE` and `useState(MOCK_SITE)` at the bottom of the script tag.
- **Mock vs Live data** — `USE_MOCK = false` means the dashboard tries to fetch real data from Umami. Set to `true` to use mock data for development.
- **Tone, length, emoji** — settings persist in `localStorage` per browser.
- **Context files** — uploaded files persist in `localStorage` under `honoroll_context_files`.

## Auto-Deploy

Every `git push` to the `main` branch automatically deploys to Vercel.

## File Structure

```
honoroll-dashboard/
├── api/
│   ├── groq.js          # AI generation proxy
│   ├── umami.js         # Analytics proxy
│   └── seo.js           # SEO audit proxy
├── index.html           # Frontend (React + Recharts inline)
├── vercel.json          # Vercel config
├── .env.example         # Required env vars
├── .gitignore
├── CLAUDE.md            # Project context for Claude
└── README.md            # This file
```

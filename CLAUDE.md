# Honoroll Dashboard — Project Context for Claude

This file gives Claude (in Claude Code or any Claude-powered tool) immediate context about this project so you can pick up exactly where things left off.

## What This Is

A single-page marketing dashboard for Honoroll combining:
- **Analytics** (Umami Cloud + PageSpeed + SEO Score) with AI-powered insights
- **Content generation** (X posts, threads, articles via Groq + Llama 3.3 70B)
- **Content calendar** with scheduling, X-style preview, and per-entry image uploads
- **UTM link builder** with history, search, and filter
- **Settings**: Context Files, Brand Assets, Integrations, Site, Defaults
- **Magic-link auth** — users must sign in (invitation-only)

Designed for the closed-beta launch phase. Mock data toggle for analytics in development.

## Tech Stack

- **Frontend:** React 18 + Recharts + Supabase JS via CDN (no build step)
- **JSX:** Compiled in-browser via Babel standalone
- **Backend:** Vercel serverless functions (`/api/*.js`) proxying analytics/AI/SEO APIs
- **Auth + Data + Storage:** Supabase (Postgres + Auth + Storage)
- **Hosting:** Vercel auto-deploys on every push to `main`

## Supabase Project

- **Project ID:** `zzxmpemfozerswguzoaz`
- **Region:** `eu-north-1`
- **URL:** `https://zzxmpemfozerswguzoaz.supabase.co`
- **Auth:** Magic link only (email-based, passwordless). User signups disabled — invitation-only via Supabase Dashboard.

### Tables (all RLS-enabled, scoped to `auth.uid() = user_id`)

| Table | Purpose |
|---|---|
| `context_files` | AI context (Voice / Product / Audience / Campaign / Examples) |
| `brand_assets` | Brand image references (storage paths) + descriptions |
| `utm_links` | Built UTM links with full URL |
| `calendar_entries` | Scheduled/drafted posts, threads, articles |
| `user_settings` | Tone, post/thread/article length defaults (1 row per user, auto-created by trigger on signup) |

### Storage Buckets (both private, RLS: first folder = user UID)

| Bucket | Purpose |
|---|---|
| `brand-assets` | Brand asset images |
| `calendar-images` | Per-entry image uploads |

Files are accessed via 1-hour signed URLs, batch-fetched on load.

## File Map

```
api/
  groq.js     → Llama 3.3 70B via Groq (system + user prompt → text)
  umami.js    → Umami Cloud analytics (path passthrough, region optional)
  seo.js      → SEO Score API (domain → audit JSON)
index.html    → Entire frontend in one file with inline JSX in <script type="text/babel">
vercel.json   → Routes /api/* to serverless functions
.env.example  → Required: UMAMI_API_KEY, GROQ_API_KEY, SEO_SCORE_API_KEY
```

## Environment Variables (Vercel Project Settings)

- `UMAMI_API_KEY` — from cloud.umami.is
- `GROQ_API_KEY` — from console.groq.com
- `SEO_SCORE_API_KEY` — from seoscoreapi.com

Supabase credentials are NOT environment variables — the publishable (anon) key and URL are baked into `index.html`. They are safe to expose; security comes from RLS, not from secret keys.

## Development Workflow

1. Edit `index.html` directly (entire app is in one file)
2. The React JSX is in the `<script type="text/babel">` block
3. Test locally: `vercel dev`
4. Push to GitHub: `git add . && git commit -m "..." && git push`
5. Vercel auto-deploys

## Code Architecture (inside index.html)

The script tag contains, in order:
1. Color palette `C` and font constants
2. Supabase client `getSupabase()` (lazy init)
3. Helper functions (date ranges, fetch wrappers, formatters)
4. Data fetching hook `useAnalyticsData`
5. UI components (KPIs, charts, breakdowns)
6. AI integration: `callLLM` → posts to `/api/groq`
7. `AIInsights` with TrendCard and "Provide more context"
8. Date range / compare selector / sticky bar
9. `Dashboard` (Analytics tab)
10. Content components (`EditableText`, `EmojiBtn`, `LengthPicker`, `ScheduleBtn`, `ContentCalendar`, `ContentQueue`, `ArticleCard`)
11. `ContentPage` (Content tab)
12. `UtmPage` (UTM Links tab)
13. `ContextFilesPanel`, `BrandAssetsPanel`, `PromptTemplateModal`
14. `Header`, `LoginScreen`, `SettingsPage`
15. **Supabase data hooks:**
    - `useAuth(user, signOut, loading)` — session management
    - `useContextFiles(user)` — CRUD on `context_files`
    - `useUtmLinks(user)` — CRUD on `utm_links`
    - `useUserSettings(user)` — debounced upserts to `user_settings`
    - `useCalendarEntries(user)` — CRUD on `calendar_entries` + image upload helpers
    - `useBrandAssets(user)` — Storage upload + DB row, signed URLs
16. `App` (outer auth gate) + `AuthenticatedApp` (all other state)

## Known Conventions

- All API keys go through Vercel serverless proxies. **Never put API keys in `index.html`.**
- Supabase URL and anon (publishable) key ARE in `index.html` — that's fine, they're public.
- Mock data: `USE_MOCK = true` is a hardcoded analytics dataset; the analytics proxies aren't called. Set to `false` for production data.
- `KEYS` object in `index.html` is intentionally empty — the proxies handle auth.
- Snake_case in DB, camelCase in React. Conversion happens in `rowTo*` helpers (e.g. `rowToContextFile`).
- All user-scoped queries filter via RLS. No need to add `.eq("user_id", ...)` in selects — RLS handles it.

## Critical: React Hooks Rule
The auth gate is split into outer `App` (only calls `useAuth`) and inner `AuthenticatedApp` (everything else). Do NOT add `useState`/`useEffect` to outer `App` before the auth-loading or no-user early returns — that breaks the rule of hooks.

## Critical: Optimistic vs Pessimistic
- `useUserSettings.updateSettings` is **optimistic + debounced (400ms)** to handle rapid toggles without race conditions. A `useRef` tracks the latest settings across rapid calls.
- Other hooks are **pessimistic** (await Supabase, update state on success). Good for slower mutations where confirmation matters.

## Common Tasks

- **Add a new feature** — usually a new component near related ones, then wired into `App`/`AuthenticatedApp` or one of the tab components
- **Modify AI prompts** — search for `SYS_PROMPT`, `X_POST_PROMPT`, `X_THREAD_PROMPT`, `X_ARTICLE_PROMPT`
- **Add a new context file category** — `CONTEXT_CATEGORIES` array near `ContextFilesPanel`
- **Add a UTM source/medium option** — `UTM_SOURCES` and `UTM_MEDIUMS` arrays near `UtmPage`
- **Invite a new user** — Supabase Dashboard → Authentication → Users → Invite

## Don't Do

- Don't introduce a build step (keep Vite/webpack out — single HTML file is the design)
- Don't put API keys for Groq/Umami/SEO in `index.html` (always use proxies)
- Don't use localStorage for data that needs to persist across devices — use Supabase
- Don't use `<Line>` inside `<AreaChart>` — use `<ComposedChart>` for mixed series
- Don't enable public Supabase signups — invitation-only is the design

## Useful References

- **Supabase docs:** https://supabase.com/docs
- **Supabase JS client:** https://supabase.com/docs/reference/javascript/introduction
- **Recharts docs:** https://recharts.org/en-US/api
- **Umami API:** https://umami.is/docs/api
- **Groq API:** https://console.groq.com/docs
- **Vercel serverless:** https://vercel.com/docs/functions

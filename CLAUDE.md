# Honoroll Dashboard — Project Context for Claude

This file gives Claude (in Claude Code or any Claude-powered tool) immediate context about this project so you can pick up exactly where things left off.

## What This Is

A single-page marketing dashboard for Honoroll combining:
- **Analytics** (Umami Cloud + PageSpeed + SEO Score) with AI-powered insights
- **Content generation** (X posts, threads, articles via Groq + Llama 3.3 70B)
- **Content calendar** with scheduling and X-style preview
- **UTM link builder** with history
- **Settings** with Context Files, Brand Assets, Integrations, Site, Defaults

Designed for the closed-beta launch phase. Mock data toggle for development.

## Tech Stack

- **Frontend:** React 18 + Recharts via CDN (no build step)
- **JSX:** Compiled in-browser via Babel standalone
- **Backend:** Vercel serverless functions (`/api/*.js`) proxying API calls
- **Hosting:** Vercel auto-deploys on every push to `main`
- **Persistence:** `localStorage` for context files, brand assets, UTM history, defaults

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

## Development Workflow

1. Edit `index.html` directly (entire app is in one file)
2. The React JSX is in the `<script type="text/babel">` block
3. Test locally: `vercel dev`
4. Push to GitHub: `git add . && git commit -m "..." && git push`
5. Vercel auto-deploys

## Code Architecture (inside index.html)

The script tag contains, in order:
1. Color palette `C` and font constants
2. Helper functions (date ranges, fetch wrappers, formatters)
3. Data fetching hook `useAnalyticsData`
4. UI components: `KPI`, `Heading`, `BTable`, `GeoChart`, `SiteHealth`, etc.
5. AI integration: `callLLM` → posts to `/api/groq`
6. `AIInsights` with `TrendCard` and "Provide more context" feature
7. Date range / compare selector / sticky bar
8. `Dashboard` (Analytics tab)
9. Content components: `EditableText`, `EmojiBtn`, `LengthPicker`, `ScheduleBtn`, `ContentCalendar`, `ContentQueue`, `ArticleCard`
10. `ContentPage` (Content tab)
11. `UtmPage` (UTM Links tab)
12. `ContextFilesPanel`, `BrandAssetsPanel`, `PromptTemplateModal`
13. `Header` and `SettingsPage`
14. `App` — root with tab routing and global state

## Known Conventions

- All API keys go through Vercel serverless proxies. **Never put API keys in `index.html`.**
- The `KEYS` object in `index.html` is intentionally empty — the proxies handle auth.
- Mock data: when `USE_MOCK = true`, the app uses a hardcoded mock dataset and the API proxies aren't called. Set to `false` for production data.
- The dashboard's `localStorage` keys are prefixed `honoroll_*`.

## Common Tasks

- **Add a new feature** — usually a new component near related ones, then wired into `App` or one of the tab components
- **Modify AI prompts** — search for `SYS_PROMPT`, `X_POST_PROMPT`, `X_THREAD_PROMPT`, `X_ARTICLE_PROMPT`
- **Change tabs** — the `TABS` array inside `Header` component
- **Change date ranges** — `DATE_RANGES` constant near the top
- **Add a new context file category** — `CONTEXT_CATEGORIES` array near `ContextFilesPanel`
- **Add a UTM source/medium option** — `UTM_SOURCES` and `UTM_MEDIUMS` arrays near `UtmPage`

## Recent Major Changes

- Restructured navigation: Header with logo + tabs + settings gear (no user/account)
- Settings page with 5 sub-sections: Context Files, Brand Assets, Integrations, Site, Defaults
- Date ranges changed to: 24h / 7d / 30d / All time (was Today/Yesterday/...)
- Sticky range bar moved between Site Health and At a Glance
- AI Insights has its own date range selector (independent)
- "Compare to" toggle added (Previous period / Same period last week / Same period last year / None)
- KPIs show comparison labels in tooltips
- Context Files system with prompt templates (5 categories) and active/inactive toggles
- UTM Builder with 3 fields, dropdowns + custom, history with search/filter
- Image generation removed from drafts, moved to per-calendar-entry image upload
- Schedule popup highlights the existing scheduled day
- Content Queue shows only scheduled posts with remove buttons

## Don't Do

- Don't introduce a build step (keep Vite/webpack out — single HTML file is the design)
- Don't put API keys in `index.html` (always use proxies)
- Don't use `localStorage` from inside React server-render contexts (always wrap in try/catch with `typeof localStorage !== "undefined"` guard)
- Don't use `<Line>` inside `<AreaChart>` — use `<ComposedChart>` for mixed series

## Useful References

- **Recharts docs:** https://recharts.org/en-US/api
- **Umami API:** https://umami.is/docs/api
- **Groq API:** https://console.groq.com/docs
- **Vercel serverless:** https://vercel.com/docs/functions

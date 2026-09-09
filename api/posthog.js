import { requireAuth } from "./_auth.js";

// PostHog analytics proxy. Dispatches to a whitelisted set of HogQL queries
// and reshapes each response into the same {x, y} / {t, x, y} shape the
// dashboard's useAnalyticsData hook already expects (originally shaped after
// the Umami API). This keeps the client-side change to a URL swap.
//
// All user-controlled params are validated with strict regexes before being
// interpolated into HogQL. No client-controlled SQL is allowed.
//
// Env vars:
//   POSTHOG_API_KEY    — personal API key with query:read scope (required)
//   POSTHOG_PROJECT_ID — numeric project id (required)
//   POSTHOG_HOST       — "us.posthog.com" or "eu.posthog.com" (default us)

export const config = { maxDuration: 60 };

const isoDate = (v) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}:\d{2}(?:\.\d+)?)?Z?$/.test(v);
const isoHost = (v) => typeof v === "string" && v.length <= 253 && /^[A-Za-z0-9.-]+$/.test(v);
const isoInt = (v, max) => Number.isInteger(+v) && +v >= 0 && +v <= max;
const isoUnit = (v) => v === "hour" || v === "day";

const sq = (s) => String(s).replace(/'/g, "''");
// Host filter matches the site's root domain and every subdomain of it, so a
// site_domain of testnet.honoroll.io also includes staging.testnet.honoroll.io
// while still excluding localhost / unrelated hosts. Root = last two labels.
// HogQL: $-prefixed properties use bracket notation (properties['$host']).
const rootDomain = (host) => host.split(".").slice(-2).join(".");
const hostClause = (host) => {
  if (!host) return "";
  const root = sq(rootDomain(host));
  return ` AND (properties['$host'] = '${root}' OR endsWith(properties['$host'], '.${root}'))`;
};

const QUERIES = {
  stats: ({ start, end, host }) => `
    SELECT
      count() AS pageviews,
      uniq(distinct_id) AS visitors,
      uniq(properties['$session_id']) AS visits,
      0 AS bounces,
      0 AS totaltime
    FROM events
    WHERE event = '$pageview'
      AND timestamp >= toDateTime('${sq(start)}')
      AND timestamp < toDateTime('${sq(end)}')
      ${hostClause(host)}
  `,
  active: ({ host }) => `
    SELECT uniq(distinct_id) AS visitors
    FROM events
    WHERE event = '$pageview'
      AND timestamp >= now() - interval 5 minute
      ${hostClause(host)}
  `,
  timeseries: ({ start, end, unit, host }) => `
    SELECT
      ${unit === "hour" ? "toStartOfHour" : "toStartOfDay"}(timestamp) AS bucket,
      count() AS pageviews,
      uniq(properties['$session_id']) AS sessions
    FROM events
    WHERE event = '$pageview'
      AND timestamp >= toDateTime('${sq(start)}')
      AND timestamp < toDateTime('${sq(end)}')
      ${hostClause(host)}
    GROUP BY bucket
    ORDER BY bucket
  `,
  breakdown: ({ start, end, prop, host, limit }) => `
    SELECT ${prop} AS name, count() AS value
    FROM events
    WHERE event = '$pageview'
      AND ${prop} IS NOT NULL
      AND ${prop} != ''
      AND timestamp >= toDateTime('${sq(start)}')
      AND timestamp < toDateTime('${sq(end)}')
      ${hostClause(host)}
    GROUP BY name
    ORDER BY value DESC
    LIMIT ${limit}
  `,
  top_events: ({ start, end, host, limit }) => `
    SELECT event AS name, count() AS value
    FROM events
    WHERE event NOT LIKE '$%'
      AND timestamp >= toDateTime('${sq(start)}')
      AND timestamp < toDateTime('${sq(end)}')
      ${hostClause(host)}
    GROUP BY event
    ORDER BY value DESC
    LIMIT ${limit}
  `,
  channels: ({ start, end, host, limit }) => `
    SELECT coalesce(properties['utm_source'], 'Direct') AS name, count() AS value
    FROM events
    WHERE event = '$pageview'
      AND timestamp >= toDateTime('${sq(start)}')
      AND timestamp < toDateTime('${sq(end)}')
      ${hostClause(host)}
    GROUP BY name
    ORDER BY value DESC
    LIMIT ${limit}
  `,
  event_series: ({ start, end, unit, host }) => `
    SELECT
      ${unit === "hour" ? "toStartOfHour" : "toStartOfDay"}(timestamp) AS bucket,
      event AS name,
      count() AS value
    FROM events
    WHERE event NOT LIKE '$%'
      AND timestamp >= toDateTime('${sq(start)}')
      AND timestamp < toDateTime('${sq(end)}')
      ${hostClause(host)}
    GROUP BY bucket, event
    ORDER BY bucket, value DESC
    LIMIT 1000
  `,
};

const BREAKDOWN_PROPS = {
  path: "properties['$pathname']",
  referrer: "properties['$referring_domain']",
  country: "properties['$geoip_country_code']",
  browser: "properties['$browser']",
  device: "properties['$device_type']",
  os: "properties['$os']",
  host: "properties['$host']",
};

// Convert PostHog {columns, results} → array of column-keyed objects.
function toObjects(response) {
  const cols = response.columns || [];
  const rows = response.results || [];
  return rows.map((row) => {
    const obj = {};
    cols.forEach((c, i) => { obj[c] = row[i]; });
    return obj;
  });
}

// Reshape server-side into the client-expected shape (matches Umami shapes so
// useAnalyticsData needs no field-name changes).
function reshape(type, objects) {
  switch (type) {
    case "stats": {
      const r = objects[0] || {};
      return {
        pageviews: r.pageviews || 0,
        visitors: r.visitors || 0,
        visits: r.visits || 0,
        bounces: r.bounces || 0,
        totaltime: r.totaltime || 0,
      };
    }
    case "active":
      return { visitors: (objects[0] || {}).visitors || 0 };
    case "timeseries":
      return {
        pageviews: objects.map((r) => ({ x: r.bucket, y: r.pageviews || 0 })),
        sessions: objects.map((r) => ({ x: r.bucket, y: r.sessions || 0 })),
      };
    case "breakdown":
    case "top_events":
    case "channels":
      // PostHog labels direct traffic "$direct"; show a human label instead.
      return objects.map((r) => ({ x: r.name === "$direct" ? "Direct" : r.name, y: r.value || 0 }));
    case "event_series":
      return objects.map((r) => ({ t: r.bucket, x: r.name, y: r.value || 0 }));
    default:
      return objects;
  }
}

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  const user = await requireAuth(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  const HOST = process.env.POSTHOG_HOST || "us.posthog.com";
  const PROJECT_ID = process.env.POSTHOG_PROJECT_ID;
  const API_KEY = process.env.POSTHOG_API_KEY;
  if (!PROJECT_ID || !API_KEY) {
    return res.status(500).json({ error: "PostHog credentials not configured on the server" });
  }

  const q = req.query || {};
  const type = String(q.type || "");
  const start = String(q.start || "");
  const end = String(q.end || "");
  const unit = String(q.unit || "hour");
  const host = q.host ? String(q.host) : "";
  const limit = q.limit ? +q.limit : 10;
  const prop = q.prop ? String(q.prop) : "";

  const needsRange = type !== "active";
  if (needsRange && (!isoDate(start) || !isoDate(end))) {
    return res.status(400).json({ error: "Invalid start/end (expected ISO datetime)" });
  }
  if (host && !isoHost(host)) return res.status(400).json({ error: "Invalid host" });
  if ((type === "timeseries" || type === "event_series") && !isoUnit(unit)) {
    return res.status(400).json({ error: "Invalid unit (hour|day)" });
  }
  if (!isoInt(limit, 100)) return res.status(400).json({ error: "Invalid limit" });

  let queryString;
  if (type === "stats") queryString = QUERIES.stats({ start, end, host });
  else if (type === "active") queryString = QUERIES.active({ host });
  else if (type === "timeseries") queryString = QUERIES.timeseries({ start, end, unit, host });
  else if (type === "breakdown") {
    const p = BREAKDOWN_PROPS[prop];
    if (!p) return res.status(400).json({ error: "Invalid breakdown prop" });
    queryString = QUERIES.breakdown({ start, end, prop: p, host, limit });
  }
  else if (type === "top_events") queryString = QUERIES.top_events({ start, end, host, limit });
  else if (type === "channels") queryString = QUERIES.channels({ start, end, host, limit });
  else if (type === "event_series") queryString = QUERIES.event_series({ start, end, unit, host });
  else return res.status(400).json({ error: "Unknown query type" });

  try {
    // PostHog current Query API endpoint uses /environments/{id}/; the older
    // /projects/{id}/ path also works but environments is the current standard.
    const url = `https://${HOST}/api/environments/${PROJECT_ID}/query/`;
    const r = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${API_KEY}`,
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
      body: JSON.stringify({ query: { kind: "HogQLQuery", query: queryString.trim() } }),
    });
    if (!r.ok) {
      const errText = await r.text();
      return res.status(r.status).json({ error: errText.slice(0, 500) });
    }
    const data = await r.json();
    const shaped = reshape(type, toObjects(data));
    res.setHeader("Cache-Control", "s-maxage=60, stale-while-revalidate=120");
    return res.status(200).json(shaped);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}

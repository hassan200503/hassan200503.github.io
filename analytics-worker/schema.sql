-- D1 schema for the private portfolio analytics service.
-- Apply with:
--   npx wrangler d1 execute hassan_portfolio_analytics --remote --file=./schema.sql

CREATE TABLE IF NOT EXISTS visits (
  id              TEXT PRIMARY KEY,
  session_id      TEXT NOT NULL,
  visitor_hash    TEXT NOT NULL,
  ts              INTEGER NOT NULL,
  day             TEXT NOT NULL,
  path            TEXT NOT NULL,
  url             TEXT,
  title           TEXT,
  referrer        TEXT,
  referrer_host   TEXT,
  utm_source      TEXT,
  utm_medium      TEXT,
  utm_campaign    TEXT,
  ip              TEXT,
  ip_version      TEXT,
  country_code    TEXT,
  country         TEXT,
  region          TEXT,
  city            TEXT,
  postal          TEXT,
  latitude        REAL,
  longitude       REAL,
  timezone        TEXT,
  continent       TEXT,
  colo            TEXT,
  asn             INTEGER,
  net_org         TEXT,
  company         TEXT,
  company_domain  TEXT,
  is_hosting      INTEGER NOT NULL DEFAULT 0,
  is_vpn          INTEGER NOT NULL DEFAULT 0,
  is_proxy        INTEGER NOT NULL DEFAULT 0,
  is_tor          INTEGER NOT NULL DEFAULT 0,
  device_type     TEXT,
  os              TEXT,
  browser         TEXT,
  browser_version TEXT,
  language        TEXT,
  screen_w        INTEGER,
  screen_h        INTEGER,
  viewport_w      INTEGER,
  viewport_h      INTEGER,
  is_bot          INTEGER NOT NULL DEFAULT 0,
  is_owner        INTEGER NOT NULL DEFAULT 0,
  created_at      TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_visits_ts        ON visits (ts DESC);
CREATE INDEX IF NOT EXISTS idx_visits_session   ON visits (session_id);
CREATE INDEX IF NOT EXISTS idx_visits_visitor   ON visits (visitor_hash);
CREATE INDEX IF NOT EXISTS idx_visits_path      ON visits (path);

CREATE TABLE IF NOT EXISTS events (
  id           TEXT PRIMARY KEY,
  session_id   TEXT NOT NULL,
  visitor_hash TEXT NOT NULL,
  ts           INTEGER NOT NULL,
  type         TEXT NOT NULL,
  path         TEXT,
  label        TEXT,
  target       TEXT,
  value        REAL,
  meta         TEXT,
  is_bot       INTEGER NOT NULL DEFAULT 0,
  is_owner     INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_events_ts      ON events (ts DESC);
CREATE INDEX IF NOT EXISTS idx_events_session ON events (session_id);
CREATE INDEX IF NOT EXISTS idx_events_type    ON events (type);

CREATE TABLE IF NOT EXISTS sessions (
  session_id    TEXT PRIMARY KEY,
  visitor_hash  TEXT NOT NULL,
  first_ts      INTEGER NOT NULL,
  last_ts       INTEGER NOT NULL,
  pageviews     INTEGER NOT NULL DEFAULT 1,
  event_count   INTEGER NOT NULL DEFAULT 0,
  max_scroll    INTEGER NOT NULL DEFAULT 0,
  duration_ms   INTEGER NOT NULL DEFAULT 0,
  country_code  TEXT,
  country       TEXT,
  region        TEXT,
  city          TEXT,
  asn           INTEGER,
  net_org       TEXT,
  company       TEXT,
  company_domain TEXT,
  is_hosting    INTEGER NOT NULL DEFAULT 0,
  is_vpn        INTEGER NOT NULL DEFAULT 0,
  is_proxy      INTEGER NOT NULL DEFAULT 0,
  is_tor        INTEGER NOT NULL DEFAULT 0,
  device_type   TEXT,
  os            TEXT,
  browser       TEXT,
  language      TEXT,
  referrer_host TEXT,
  entry_path    TEXT,
  exit_path     TEXT,
  ip            TEXT,
  is_bot        INTEGER NOT NULL DEFAULT 0,
  is_owner      INTEGER NOT NULL DEFAULT 0,
  updated_at    TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sessions_last    ON sessions (last_ts DESC);
CREATE INDEX IF NOT EXISTS idx_sessions_country ON sessions (country_code);
CREATE INDEX IF NOT EXISTS idx_sessions_visitor ON sessions (visitor_hash);

-- Single-row pointer to the currently published profile photo.
CREATE TABLE IF NOT EXISTS profile_photo (
  id         INTEGER PRIMARY KEY CHECK (id = 1),
  path       TEXT NOT NULL,
  sha        TEXT,
  bytes      INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  history    TEXT
);

CREATE TABLE IF NOT EXISTS login_attempts (
  id TEXT PRIMARY KEY,
  ip TEXT NOT NULL,
  ts INTEGER NOT NULL,
  ok INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_login_ip_ts ON login_attempts (ip, ts DESC);

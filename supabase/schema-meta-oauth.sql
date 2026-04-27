-- ════════════════════════════════════════════════════════════════
-- RENTMIES — Meta OAuth Connections Schema
-- Tabla principal para guardar la conexión OAuth de cada empresa
-- con su Meta account (Facebook + Instagram + WhatsApp).
-- Safe to run multiple times — idempotent.
-- ════════════════════════════════════════════════════════════════

-- ── meta_connections ──────────────────────────────────────────
-- Una empresa = una conexión activa Meta. Si reconecta se hace UPDATE
-- (no INSERT) sobre la fila existente para esa empresa.
CREATE TABLE IF NOT EXISTS meta_connections (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id                  UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,

  -- Meta user info (the human who clicked "Continue with Facebook")
  meta_user_id                TEXT NOT NULL,
  meta_user_name              TEXT,
  meta_user_email             TEXT,

  -- Long-lived user access token (60 days)
  long_lived_token            TEXT NOT NULL,
  short_lived_token           TEXT,
  token_expires_at            TIMESTAMPTZ NOT NULL,
  last_refreshed_at           TIMESTAMPTZ,

  -- Selected Page (Facebook)
  page_id                     TEXT,
  page_name                   TEXT,
  page_picture_url            TEXT,
  page_category               TEXT,
  page_followers_count        INT,
  page_access_token           TEXT,           -- page-level token derived from user token
  page_tasks                  TEXT[],         -- ['ANALYZE', 'ADVERTISE', 'MESSAGING', ...]

  -- Linked Instagram Business Account
  ig_business_id              TEXT,
  ig_username                 TEXT,
  ig_profile_picture_url      TEXT,
  ig_followers_count          INT,

  -- WhatsApp Business Account (optional — not all users have it)
  waba_id                     TEXT,
  whatsapp_phone_number_id    TEXT,
  whatsapp_display_name       TEXT,

  -- Connection lifecycle
  status                      TEXT NOT NULL DEFAULT 'active',
                              -- 'active' | 'expired' | 'revoked' | 'error' | 'pending_page_select'
  last_error                  TEXT,
  last_health_check_at        TIMESTAMPTZ,

  -- Available pages (cached after OAuth so we can show selector even if user navigates away)
  available_pages             JSONB DEFAULT '[]',  -- [{id, name, picture, ig_id, ig_username, followers, tasks}]

  -- Audit
  source                      TEXT,           -- 'signup' | 'reconnect'
  created_at                  TIMESTAMPTZ DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(empresa_id)
);

-- Index for lookups by Meta user id (used to detect existing connections during signup)
CREATE INDEX IF NOT EXISTS idx_meta_connections_meta_user_id
  ON meta_connections (meta_user_id);

-- ── published_posts ───────────────────────────────────────────
-- Track every post published via the new OAuth flow. Augments
-- the existing social_posts table; we're keeping both because
-- social_posts is referenced by /app legacy code.
CREATE TABLE IF NOT EXISTS published_posts (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id           UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  meta_connection_id   UUID REFERENCES meta_connections(id) ON DELETE SET NULL,
  inventario_id        UUID,
  platform             TEXT NOT NULL,        -- 'facebook' | 'instagram' | 'instagram_reels' | 'instagram_stories'
  caption              TEXT,
  media_url            TEXT,                 -- the asset URL we sent to Meta
  media_kind           TEXT,                 -- 'image' | 'video'
  post_id              TEXT,                 -- Meta post id
  post_permalink       TEXT,
  status               TEXT DEFAULT 'published',
                       -- 'pending' | 'publishing' | 'processing' | 'published' | 'failed'
  error_message        TEXT,
  scheduled_at         TIMESTAMPTZ,
  published_at         TIMESTAMPTZ,
  created_at           TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_published_posts_empresa_id
  ON published_posts (empresa_id);
CREATE INDEX IF NOT EXISTS idx_published_posts_status
  ON published_posts (status);

-- ── RLS (enable but no destructive policy changes) ─────────────
ALTER TABLE meta_connections  ENABLE ROW LEVEL SECURITY;
ALTER TABLE published_posts   ENABLE ROW LEVEL SECURITY;

-- Service role bypasses RLS (the backend uses SUPABASE_SERVICE_KEY).
-- Frontend never reads these tables directly — it goes through the API.

-- ── Helpful view: connection health summary ───────────────────
CREATE OR REPLACE VIEW meta_connections_health AS
SELECT
  mc.empresa_id,
  mc.status,
  mc.page_name,
  mc.ig_username,
  mc.token_expires_at,
  EXTRACT(DAY FROM (mc.token_expires_at - NOW())) AS days_until_expiry,
  CASE
    WHEN mc.status != 'active' THEN 'unhealthy'
    WHEN mc.token_expires_at < NOW() THEN 'expired'
    WHEN mc.token_expires_at < NOW() + INTERVAL '7 days' THEN 'expiring_soon'
    ELSE 'healthy'
  END AS health
FROM meta_connections mc;

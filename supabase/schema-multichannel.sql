-- ════════════════════════════════════════════════════════════════
-- RENTMIES — Multi-channel schema
-- Adds tables for WhatsApp Templates / Broadcasts, Google Ads, and
-- TikTok ads as first-class siblings to the existing meta_connections
-- and published_posts. Every table is namespaced by channel prefix
-- (whatsapp_*, google_*, tiktok_*) so it's clear which feature owns
-- which data, and adding a fifth channel later is a copy-paste job.
--
-- Idempotent: safe to run multiple times. Uses CREATE TABLE IF NOT
-- EXISTS, ADD COLUMN IF NOT EXISTS, and CREATE INDEX IF NOT EXISTS.
-- Assumes empresas table already exists (schema-auth-credentials.sql).
-- ════════════════════════════════════════════════════════════════

-- ╔══════════════════════════════════════════════════════════════╗
-- ║ WHATSAPP                                                     ║
-- ║ Three resources: Templates (creative units approved by Meta) ║
-- ║ → Broadcasts (campaigns that send a template to a list of    ║
-- ║ contacts) → Recipients (one row per contact per broadcast).  ║
-- ╚══════════════════════════════════════════════════════════════╝

-- ── whatsapp_templates ──────────────────────────────────────────
-- Mirrors what Meta returns via /v21.0/{waba_id}/message_templates.
-- We cache locally so the dashboard doesn't hit Graph on every load
-- and we can sort / filter / annotate without API limits.
CREATE TABLE IF NOT EXISTS whatsapp_templates (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id           UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  meta_connection_id   UUID REFERENCES meta_connections(id) ON DELETE SET NULL,

  -- Meta-side identifiers
  waba_id              TEXT NOT NULL,
  meta_template_id     TEXT,                 -- numeric id from Graph
  name                 TEXT NOT NULL,        -- snake_case slug visible to Meta
  language             TEXT NOT NULL DEFAULT 'es',
  category             TEXT NOT NULL,        -- 'MARKETING' | 'UTILITY' | 'AUTHENTICATION'
  status               TEXT NOT NULL DEFAULT 'DRAFT',
                       -- 'DRAFT' | 'PENDING' | 'APPROVED' | 'REJECTED' | 'PAUSED' | 'DISABLED'
  rejection_reason     TEXT,

  -- Body content (we store the structured definition Meta expects)
  components           JSONB NOT NULL DEFAULT '[]',  -- [{type:'HEADER',...},{type:'BODY',...},{type:'BUTTONS',...}]
  variables_schema     JSONB DEFAULT '[]',           -- [{key:'1', label:'Nombre', example:'Camila'}, ...]

  -- Authoring metadata
  created_by_user_id   UUID,
  notes                TEXT,                  -- internal-only annotation
  preview_image_url    TEXT,                  -- optional cached render

  created_at           TIMESTAMPTZ DEFAULT NOW(),
  updated_at           TIMESTAMPTZ DEFAULT NOW(),
  submitted_at         TIMESTAMPTZ,           -- when we sent it to Meta for review
  approved_at          TIMESTAMPTZ,

  UNIQUE (empresa_id, waba_id, name, language)
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_templates_empresa
  ON whatsapp_templates (empresa_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_templates_status
  ON whatsapp_templates (status);
CREATE INDEX IF NOT EXISTS idx_whatsapp_templates_waba
  ON whatsapp_templates (waba_id);

-- ── whatsapp_broadcasts ─────────────────────────────────────────
-- A broadcast = one approved template + list of contacts + window.
CREATE TABLE IF NOT EXISTS whatsapp_broadcasts (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id           UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  template_id          UUID NOT NULL REFERENCES whatsapp_templates(id) ON DELETE RESTRICT,

  name                 TEXT NOT NULL,        -- human label, shown in the UI
  language             TEXT NOT NULL DEFAULT 'es',

  -- Timing
  status               TEXT NOT NULL DEFAULT 'draft',
                       -- 'draft' | 'scheduled' | 'sending' | 'paused' | 'completed' | 'failed' | 'cancelled'
  scheduled_at         TIMESTAMPTZ,          -- null = send immediately
  started_at           TIMESTAMPTZ,
  completed_at         TIMESTAMPTZ,

  -- Throttling — avoid tripping WABA tier limits
  rate_per_minute      INT DEFAULT 60,

  -- Metrics rollup (denormalized so the list view doesn't aggregate)
  total_recipients     INT DEFAULT 0,
  sent_count           INT DEFAULT 0,
  delivered_count      INT DEFAULT 0,
  read_count           INT DEFAULT 0,
  failed_count         INT DEFAULT 0,
  replied_count        INT DEFAULT 0,

  -- Authoring
  created_by_user_id   UUID,
  source_csv_filename  TEXT,                 -- the file the user uploaded
  variables_payload    JSONB DEFAULT '{}',   -- defaults if a row's variable is empty

  created_at           TIMESTAMPTZ DEFAULT NOW(),
  updated_at           TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_broadcasts_empresa
  ON whatsapp_broadcasts (empresa_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_broadcasts_status
  ON whatsapp_broadcasts (status);
CREATE INDEX IF NOT EXISTS idx_whatsapp_broadcasts_scheduled
  ON whatsapp_broadcasts (scheduled_at) WHERE scheduled_at IS NOT NULL;

-- ── whatsapp_broadcast_recipients ───────────────────────────────
-- One row per contact per broadcast. Holds the per-message state
-- and Meta's wamid so we can correlate webhook callbacks.
CREATE TABLE IF NOT EXISTS whatsapp_broadcast_recipients (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id           UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  broadcast_id         UUID NOT NULL REFERENCES whatsapp_broadcasts(id) ON DELETE CASCADE,

  phone_e164           TEXT NOT NULL,        -- normalized to E.164 on insert
  contact_name         TEXT,
  variables            JSONB DEFAULT '{}',   -- per-row variable values for the template

  status               TEXT NOT NULL DEFAULT 'pending',
                       -- 'pending' | 'sending' | 'sent' | 'delivered' | 'read' | 'failed' | 'replied' | 'opted_out'
  meta_wamid           TEXT,                 -- Meta's message id (for webhook correlation)
  error_code           TEXT,
  error_message        TEXT,

  sent_at              TIMESTAMPTZ,
  delivered_at         TIMESTAMPTZ,
  read_at              TIMESTAMPTZ,
  replied_at           TIMESTAMPTZ,
  failed_at            TIMESTAMPTZ,

  created_at           TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wa_broadcast_recipients_broadcast
  ON whatsapp_broadcast_recipients (broadcast_id);
CREATE INDEX IF NOT EXISTS idx_wa_broadcast_recipients_status
  ON whatsapp_broadcast_recipients (status);
CREATE INDEX IF NOT EXISTS idx_wa_broadcast_recipients_wamid
  ON whatsapp_broadcast_recipients (meta_wamid) WHERE meta_wamid IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_wa_broadcast_recipients_phone
  ON whatsapp_broadcast_recipients (empresa_id, phone_e164);

-- ╔══════════════════════════════════════════════════════════════╗
-- ║ GOOGLE ADS                                                   ║
-- ║ One connection per empresa (the OAuth grant + customer_id),  ║
-- ║ many campaigns, many lead forms, many leads.                 ║
-- ╚══════════════════════════════════════════════════════════════╝

-- ── google_connections ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS google_connections (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id                  UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,

  -- Google identity
  google_user_id              TEXT NOT NULL,
  google_user_email           TEXT,
  google_user_name            TEXT,

  -- OAuth tokens
  refresh_token               TEXT NOT NULL,
  access_token                TEXT,
  access_token_expires_at     TIMESTAMPTZ,
  scopes                      TEXT[],

  -- Google Ads account
  customer_id                 TEXT,                  -- '123-456-7890' format
  manager_customer_id         TEXT,                  -- MCC if Rentmies manages on behalf of client
  account_currency_code       TEXT,
  account_time_zone           TEXT,
  account_status              TEXT,                  -- 'ENABLED' | 'CANCELED' | 'SUSPENDED'

  -- Connection lifecycle
  status                      TEXT NOT NULL DEFAULT 'active',
                              -- 'active' | 'expired' | 'revoked' | 'error' | 'pending_account_select'
  last_error                  TEXT,
  last_health_check_at        TIMESTAMPTZ,

  available_accounts          JSONB DEFAULT '[]',    -- [{customer_id, descriptive_name, currency, status}]

  source                      TEXT,                  -- 'oauth' | 'manual'
  created_at                  TIMESTAMPTZ DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE (empresa_id)
);

CREATE INDEX IF NOT EXISTS idx_google_connections_user
  ON google_connections (google_user_id);

-- ── google_campaigns ────────────────────────────────────────────
-- Campaigns we created (or imported) via the Google Ads API.
CREATE TABLE IF NOT EXISTS google_campaigns (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id                  UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  google_connection_id        UUID REFERENCES google_connections(id) ON DELETE SET NULL,

  -- Google identifiers
  google_campaign_id          TEXT,                   -- numeric id once created
  customer_id                 TEXT NOT NULL,
  campaign_resource_name      TEXT,                   -- 'customers/.../campaigns/...'

  -- Authoring
  name                        TEXT NOT NULL,
  campaign_type               TEXT NOT NULL,
                              -- 'SEARCH' | 'DISPLAY' | 'PERFORMANCE_MAX' | 'VIDEO' | 'LOCAL'
  channel_subtype             TEXT,                   -- e.g. 'PERFORMANCE_MAX_RETAIL'
  status                      TEXT NOT NULL DEFAULT 'DRAFT',
                              -- mirror of Google enum: 'ENABLED' | 'PAUSED' | 'REMOVED' | 'DRAFT'

  -- Budget
  budget_amount_micros        BIGINT,                 -- COP * 1_000_000
  budget_currency_code        TEXT DEFAULT 'COP',
  budget_delivery_method      TEXT DEFAULT 'STANDARD',

  -- Targeting (denormalized snapshot at last sync)
  target_locations            JSONB DEFAULT '[]',     -- [{geo_target:'2170', label:'Bogotá'}]
  target_languages            JSONB DEFAULT '[]',
  bidding_strategy            TEXT,                    -- 'MAXIMIZE_CONVERSIONS', 'TARGET_CPA', etc.
  target_cpa_micros           BIGINT,
  target_roas                 NUMERIC(6,2),

  -- Inmueble association (so campaigns map back to a property)
  inventario_id               UUID,
  inventario_url              TEXT,

  -- Performance rollup (refreshed by sync job)
  impressions                 BIGINT DEFAULT 0,
  clicks                      BIGINT DEFAULT 0,
  cost_micros                 BIGINT DEFAULT 0,
  conversions                 NUMERIC(12,2) DEFAULT 0,
  cost_per_conversion_micros  BIGINT DEFAULT 0,
  last_synced_at              TIMESTAMPTZ,

  created_at                  TIMESTAMPTZ DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_google_campaigns_empresa
  ON google_campaigns (empresa_id);
CREATE INDEX IF NOT EXISTS idx_google_campaigns_status
  ON google_campaigns (status);
CREATE INDEX IF NOT EXISTS idx_google_campaigns_customer
  ON google_campaigns (customer_id);
CREATE INDEX IF NOT EXISTS idx_google_campaigns_google_id
  ON google_campaigns (google_campaign_id) WHERE google_campaign_id IS NOT NULL;

-- ── google_lead_forms ───────────────────────────────────────────
-- Lead form extensions attached to campaigns + the leads they capture.
CREATE TABLE IF NOT EXISTS google_lead_forms (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id                  UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  google_campaign_id          UUID REFERENCES google_campaigns(id) ON DELETE SET NULL,

  google_lead_form_id         TEXT,
  name                        TEXT NOT NULL,
  headline                    TEXT,
  description                 TEXT,
  privacy_url                 TEXT,
  call_to_action              TEXT,                  -- 'GET_QUOTE' | 'LEARN_MORE' | 'CONTACT_US' | etc.

  questions                   JSONB DEFAULT '[]',    -- [{type:'EMAIL'},{type:'CUSTOM',label:'¿Cuándo te quieres mudar?'}]

  status                      TEXT NOT NULL DEFAULT 'ACTIVE',
                              -- 'ACTIVE' | 'PAUSED' | 'REMOVED'
  total_leads                 INT DEFAULT 0,

  created_at                  TIMESTAMPTZ DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_google_lead_forms_empresa
  ON google_lead_forms (empresa_id);

-- One row per captured lead (we store the actual answers)
CREATE TABLE IF NOT EXISTS google_leads (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id                  UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  google_lead_form_id         UUID NOT NULL REFERENCES google_lead_forms(id) ON DELETE CASCADE,
  google_campaign_id          UUID REFERENCES google_campaigns(id) ON DELETE SET NULL,

  google_user_lead_id         TEXT,
  answers                     JSONB NOT NULL DEFAULT '{}',  -- {email:'...', phone_e164:'...', custom:{...}}
  full_name                   TEXT,
  email                       TEXT,
  phone_e164                  TEXT,

  -- CRM sync
  whatsapp_followup_sent_at   TIMESTAMPTZ,
  status                      TEXT NOT NULL DEFAULT 'new',
                              -- 'new' | 'contacted' | 'qualified' | 'meeting' | 'closed' | 'lost'

  captured_at                 TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_google_leads_empresa
  ON google_leads (empresa_id);
CREATE INDEX IF NOT EXISTS idx_google_leads_form
  ON google_leads (google_lead_form_id);
CREATE INDEX IF NOT EXISTS idx_google_leads_status
  ON google_leads (status);

-- ╔══════════════════════════════════════════════════════════════╗
-- ║ TIKTOK                                                       ║
-- ║ Scaffolded — full implementation in a later block.           ║
-- ╚══════════════════════════════════════════════════════════════╝

CREATE TABLE IF NOT EXISTS tiktok_connections (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id                  UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,

  tiktok_open_id              TEXT NOT NULL,
  tiktok_username             TEXT,
  tiktok_avatar_url           TEXT,
  business_account_id         TEXT,                  -- TikTok Business Account ID

  access_token                TEXT NOT NULL,
  refresh_token               TEXT,
  access_token_expires_at     TIMESTAMPTZ,           -- TikTok tokens expire in 24h, must refresh
  refresh_token_expires_at    TIMESTAMPTZ,
  scopes                      TEXT[],

  status                      TEXT NOT NULL DEFAULT 'active',
                              -- 'active' | 'expired' | 'revoked' | 'error'
  last_error                  TEXT,
  last_refreshed_at           TIMESTAMPTZ,
  last_health_check_at        TIMESTAMPTZ,

  created_at                  TIMESTAMPTZ DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE (empresa_id)
);

CREATE INDEX IF NOT EXISTS idx_tiktok_connections_open_id
  ON tiktok_connections (tiktok_open_id);

CREATE TABLE IF NOT EXISTS tiktok_videos (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id                  UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  tiktok_connection_id        UUID REFERENCES tiktok_connections(id) ON DELETE SET NULL,
  inventario_id               UUID,

  -- TikTok identifiers
  tiktok_video_id             TEXT,
  tiktok_share_url            TEXT,

  -- Content
  caption                     TEXT,
  source_video_url            TEXT,                  -- our Supabase storage URL
  cover_image_url             TEXT,
  duration_sec                INT,

  -- State
  status                      TEXT NOT NULL DEFAULT 'pending',
                              -- 'pending' | 'uploading' | 'processing' | 'published' | 'failed'
  error_message               TEXT,

  scheduled_at                TIMESTAMPTZ,
  published_at                TIMESTAMPTZ,
  created_at                  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tiktok_videos_empresa
  ON tiktok_videos (empresa_id);
CREATE INDEX IF NOT EXISTS idx_tiktok_videos_status
  ON tiktok_videos (status);

-- ╔══════════════════════════════════════════════════════════════╗
-- ║ ROW LEVEL SECURITY                                           ║
-- ║ Service role bypasses RLS (backend uses SUPABASE_SERVICE_KEY)║
-- ║ Frontend never reads these tables directly — it goes through ║
-- ║ /api/{channel}/* endpoints.                                  ║
-- ╚══════════════════════════════════════════════════════════════╝

ALTER TABLE whatsapp_templates             ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_broadcasts            ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_broadcast_recipients  ENABLE ROW LEVEL SECURITY;
ALTER TABLE google_connections             ENABLE ROW LEVEL SECURITY;
ALTER TABLE google_campaigns               ENABLE ROW LEVEL SECURITY;
ALTER TABLE google_lead_forms              ENABLE ROW LEVEL SECURITY;
ALTER TABLE google_leads                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE tiktok_connections             ENABLE ROW LEVEL SECURITY;
ALTER TABLE tiktok_videos                  ENABLE ROW LEVEL SECURITY;

-- ╔══════════════════════════════════════════════════════════════╗
-- ║ HELPFUL VIEWS                                                ║
-- ╚══════════════════════════════════════════════════════════════╝

-- A single "channel health" view so the dashboard banner can query
-- one place instead of joining four tables on the client.
CREATE OR REPLACE VIEW channel_health_summary AS
SELECT
  e.id AS empresa_id,
  -- Meta
  CASE
    WHEN mc.id IS NULL THEN 'not_connected'
    WHEN mc.status != 'active' THEN mc.status
    WHEN mc.token_type = 'system_user' THEN 'healthy'
    WHEN mc.token_expires_at IS NULL THEN 'healthy'
    WHEN mc.token_expires_at < NOW() THEN 'expired'
    WHEN mc.token_expires_at < NOW() + INTERVAL '7 days' THEN 'expiring_soon'
    ELSE 'healthy'
  END AS meta_health,

  -- WhatsApp (rides on Meta connection — having waba_id means WA is set up)
  CASE
    WHEN mc.waba_id IS NULL THEN 'not_connected'
    WHEN mc.status != 'active' THEN 'unhealthy'
    ELSE 'healthy'
  END AS whatsapp_health,

  -- Google
  CASE
    WHEN gc.id IS NULL THEN 'not_connected'
    WHEN gc.status != 'active' THEN gc.status
    WHEN gc.access_token_expires_at IS NULL THEN 'healthy'
    WHEN gc.access_token_expires_at < NOW() THEN 'expired'
    ELSE 'healthy'
  END AS google_health,

  -- TikTok
  CASE
    WHEN tc.id IS NULL THEN 'not_connected'
    WHEN tc.status != 'active' THEN tc.status
    WHEN tc.access_token_expires_at IS NULL THEN 'healthy'
    WHEN tc.access_token_expires_at < NOW() THEN 'expired'
    ELSE 'healthy'
  END AS tiktok_health
FROM empresas e
LEFT JOIN meta_connections   mc ON mc.empresa_id = e.id
LEFT JOIN google_connections gc ON gc.empresa_id = e.id
LEFT JOIN tiktok_connections tc ON tc.empresa_id = e.id;

-- ╔══════════════════════════════════════════════════════════════╗
-- ║ updated_at triggers                                          ║
-- ╚══════════════════════════════════════════════════════════════╝

CREATE OR REPLACE FUNCTION rentmies_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE
  t TEXT;
BEGIN
  FOR t IN
    SELECT unnest(ARRAY[
      'whatsapp_templates',
      'whatsapp_broadcasts',
      'google_connections',
      'google_campaigns',
      'google_lead_forms',
      'tiktok_connections'
    ])
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%I_updated_at ON %I', t, t);
    EXECUTE format('CREATE TRIGGER trg_%I_updated_at BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION rentmies_set_updated_at()', t, t);
  END LOOP;
END;
$$;

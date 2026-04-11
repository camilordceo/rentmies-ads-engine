-- ============================================================
-- RENTMIES ADS ENGINE — SCHEMA V2 (GROWTH SUITE)
-- Run in Supabase SQL Editor
-- Extends existing tables, adds new Ads Engine tables
-- ============================================================

-- ── EXISTING TABLES (do not modify) ──
-- public.empresas (id, nombre, logo_url, plan, activa)
-- public.profiles (id, email, nombre, rol, empresa_id, avatar_url, activo, credits_remaining, plan)
-- public.inventario_sql (id, empresa_id, tipo_inmueble_propiedad, tipo_transaccion_negocio, ...)
-- public.whatsapp_ai (id, empresa_id, numero_whatsapp, activo)

-- ── LEADS (from v2 landing) ──────────────────��───────────────────────────────
CREATE TABLE IF NOT EXISTS leads (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name        TEXT NOT NULL,
  email       TEXT,
  phone       TEXT NOT NULL,
  city        TEXT,
  product     TEXT,
  source      TEXT DEFAULT 'landing',
  message     TEXT,
  status      TEXT DEFAULT 'new',
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

-- ── PLANS ───────────────────────��────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS plans (
  id               TEXT PRIMARY KEY,
  product          TEXT NOT NULL,
  name             TEXT NOT NULL,
  price_cop        INTEGER NOT NULL,
  billing          TEXT DEFAULT 'monthly',
  properties_limit INTEGER,
  posts_per_month  INTEGER,
  features         JSONB,
  active           BOOLEAN DEFAULT true,
  created_at       TIMESTAMPTZ DEFAULT now()
);

-- ── SUBSCRIPTIONS ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS subscriptions (
  id                UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id         UUID,
  plan_id           TEXT REFERENCES plans(id),
  status            TEXT DEFAULT 'pending',
  start_date        TIMESTAMPTZ,
  end_date          TIMESTAMPTZ,
  payment_reference TEXT,
  amount_paid       INTEGER,
  next_billing_date TIMESTAMPTZ,
  cancelled_at      TIMESTAMPTZ,
  cancel_reason     TEXT,
  meta              JSONB,
  created_at        TIMESTAMPTZ DEFAULT now(),
  updated_at        TIMESTAMPTZ DEFAULT now()
);

-- ── CONTENT CALENDAR ────────────────────��──────────────────────���─────────────
CREATE TABLE IF NOT EXISTS content_calendar (
  id               UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  subscription_id  UUID REFERENCES subscriptions(id) ON DELETE CASCADE,
  property_id      UUID,
  post_date        DATE NOT NULL,
  platform         TEXT NOT NULL,
  content_type     TEXT DEFAULT 'image',
  caption          TEXT,
  image_url        TEXT,
  headline         TEXT,
  variation        TEXT,
  status           TEXT DEFAULT 'scheduled',
  post_id          TEXT,
  error_message    TEXT,
  metrics          JSONB,
  created_at       TIMESTAMPTZ DEFAULT now(),
  published_at     TIMESTAMPTZ
);

-- ══════════════��═════════════════════════════════════════��═════
-- NEW ADS ENGINE TABLES
-- ══════════════════════════════════════════════════════════════

-- Ad Campaigns
CREATE TABLE IF NOT EXISTS public.ad_campaigns (
  id                    UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  empresa_id            UUID NOT NULL,
  created_by            UUID,
  name                  TEXT NOT NULL,
  status                TEXT DEFAULT 'draft',
  ciudad                TEXT,
  tipo_inmueble         TEXT,
  tipo_transaccion      TEXT,
  presupuesto_diario    NUMERIC(12,2),
  presupuesto_total     NUMERIC(12,2),
  moneda                TEXT DEFAULT 'COP',
  inventario_sql_id     UUID,
  platforms             JSONB DEFAULT '[]'::jsonb,
  prompt_config         JSONB DEFAULT '{}'::jsonb,
  total_ads_generated   INT DEFAULT 0,
  total_ads_published   INT DEFAULT 0,
  created_at            TIMESTAMPTZ DEFAULT now(),
  updated_at            TIMESTAMPTZ DEFAULT now()
);

-- Ad Creatives
CREATE TABLE IF NOT EXISTS public.ad_creatives (
  id                    UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  campaign_id           UUID REFERENCES public.ad_campaigns(id) ON DELETE CASCADE,
  empresa_id            UUID NOT NULL,
  created_by            UUID,
  creative_type         TEXT DEFAULT 'image',
  variation_type        TEXT,
  headline              TEXT,
  description           TEXT,
  cta                   TEXT,
  hashtags              TEXT[],
  image_url             TEXT,
  video_url             TEXT,
  thumbnail_url         TEXT,
  media_format          TEXT,
  source_image_link     TEXT,
  status                TEXT DEFAULT 'draft',
  meta_ad_id            TEXT,
  tiktok_ad_id          TEXT,
  instagram_post_id     TEXT,
  impressions           INT DEFAULT 0,
  clicks                INT DEFAULT 0,
  spend                 NUMERIC(12,2) DEFAULT 0,
  ctr                   NUMERIC(6,4) DEFAULT 0,
  cpc                   NUMERIC(12,2) DEFAULT 0,
  conversions           INT DEFAULT 0,
  ai_decision           TEXT,
  ai_decision_reason    TEXT,
  ai_decision_at        TIMESTAMPTZ,
  created_at            TIMESTAMPTZ DEFAULT now(),
  updated_at            TIMESTAMPTZ DEFAULT now()
);

-- Ad Performance Logs
CREATE TABLE IF NOT EXISTS public.ad_performance_logs (
  id                    UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  creative_id           UUID REFERENCES public.ad_creatives(id) ON DELETE CASCADE,
  campaign_id           UUID REFERENCES public.ad_campaigns(id) ON DELETE CASCADE,
  empresa_id            UUID NOT NULL,
  log_date              DATE NOT NULL,
  platform              TEXT,
  impressions           INT DEFAULT 0,
  clicks                INT DEFAULT 0,
  spend                 NUMERIC(12,2) DEFAULT 0,
  ctr                   NUMERIC(6,4) DEFAULT 0,
  cpc                   NUMERIC(12,2) DEFAULT 0,
  conversions           INT DEFAULT 0,
  reach                 INT DEFAULT 0,
  frequency             NUMERIC(6,2) DEFAULT 0,
  created_at            TIMESTAMPTZ DEFAULT now()
);

-- AI Decision Logs
CREATE TABLE IF NOT EXISTS public.ad_ai_logs (
  id                    UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  empresa_id            UUID NOT NULL,
  creative_id           UUID,
  campaign_id           UUID,
  trigger_type          TEXT,
  metrics_snapshot      JSONB,
  decision              TEXT,
  reason                TEXT,
  new_budget            NUMERIC(12,2),
  gemini_response       JSONB,
  created_at            TIMESTAMPTZ DEFAULT now()
);

-- Video Uploads
CREATE TABLE IF NOT EXISTS public.ad_video_uploads (
  id                    UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  empresa_id            UUID NOT NULL,
  created_by            UUID,
  campaign_id           UUID REFERENCES public.ad_campaigns(id) ON DELETE SET NULL,
  filename              TEXT,
  file_size_mb          NUMERIC(8,2),
  duration_seconds      INT,
  storage_path          TEXT,
  public_url            TEXT,
  thumbnail_url         TEXT,
  title                 TEXT,
  caption               TEXT,
  hashtags              TEXT[],
  publish_to_tiktok     BOOLEAN DEFAULT false,
  publish_to_instagram_reels BOOLEAN DEFAULT false,
  publish_to_meta       BOOLEAN DEFAULT false,
  status                TEXT DEFAULT 'uploaded',
  tiktok_post_id        TEXT,
  instagram_reel_id     TEXT,
  meta_video_ad_id      TEXT,
  created_at            TIMESTAMPTZ DEFAULT now(),
  updated_at            TIMESTAMPTZ DEFAULT now()
);

-- Inventario Import Tracking
CREATE TABLE IF NOT EXISTS public.ad_inventario_imports (
  id                    UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  empresa_id            UUID NOT NULL,
  created_by            UUID,
  filename              TEXT,
  file_type             TEXT,
  rows_total            INT DEFAULT 0,
  rows_imported         INT DEFAULT 0,
  rows_failed           INT DEFAULT 0,
  status                TEXT DEFAULT 'processing',
  error_log             JSONB,
  created_at            TIMESTAMPTZ DEFAULT now()
);

-- WhatsApp Template Analytics
CREATE TABLE IF NOT EXISTS public.whatsapp_template_analytics (
  id                    UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  empresa_id            UUID NOT NULL,
  template_name         TEXT NOT NULL,
  template_id           TEXT,
  category              TEXT,
  language              TEXT DEFAULT 'es',
  log_date              DATE NOT NULL,
  sent                  INT DEFAULT 0,
  delivered             INT DEFAULT 0,
  read                  INT DEFAULT 0,
  failed                INT DEFAULT 0,
  clicked               INT DEFAULT 0,
  delivery_rate         NUMERIC(6,4) DEFAULT 0,
  read_rate             NUMERIC(6,4) DEFAULT 0,
  success_rate          NUMERIC(6,4) DEFAULT 0,
  created_at            TIMESTAMPTZ DEFAULT now(),
  UNIQUE(empresa_id, template_name, log_date)
);

-- Platform Credentials
CREATE TABLE IF NOT EXISTS public.platform_credentials (
  id                    UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  empresa_id            UUID NOT NULL,
  platform              TEXT NOT NULL,
  credentials           JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active             BOOLEAN DEFAULT true,
  last_tested_at        TIMESTAMPTZ,
  last_test_status      TEXT,
  created_at            TIMESTAMPTZ DEFAULT now(),
  updated_at            TIMESTAMPTZ DEFAULT now(),
  UNIQUE(empresa_id, platform)
);

-- ── INDEXES ──
CREATE INDEX IF NOT EXISTS idx_ad_campaigns_empresa ON public.ad_campaigns(empresa_id);
CREATE INDEX IF NOT EXISTS idx_ad_creatives_campaign ON public.ad_creatives(campaign_id);
CREATE INDEX IF NOT EXISTS idx_ad_creatives_empresa ON public.ad_creatives(empresa_id);
CREATE INDEX IF NOT EXISTS idx_ad_perf_logs_empresa_date ON public.ad_performance_logs(empresa_id, log_date);
CREATE INDEX IF NOT EXISTS idx_ad_perf_logs_campaign ON public.ad_performance_logs(campaign_id);
CREATE INDEX IF NOT EXISTS idx_ad_ai_logs_empresa ON public.ad_ai_logs(empresa_id);
CREATE INDEX IF NOT EXISTS idx_wa_analytics_empresa_date ON public.whatsapp_template_analytics(empresa_id, log_date);
CREATE INDEX IF NOT EXISTS idx_platform_creds_empresa ON public.platform_credentials(empresa_id, platform);

-- ── RLS ──
ALTER TABLE public.ad_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ad_creatives ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ad_performance_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ad_ai_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ad_video_uploads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ad_inventario_imports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_template_analytics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_credentials ENABLE ROW LEVEL SECURITY;

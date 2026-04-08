-- ============================================================
-- RENTMIES — SUPABASE SCHEMA v2
-- Nuevas tablas para el landing page y los 3 productos.
-- Ejecuta esto en el SQL Editor de tu proyecto Supabase.
-- Compatible con el schema v1 existente.
-- ============================================================

-- ── LEADS (del landing page) ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS leads (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name        TEXT NOT NULL,
  email       TEXT,
  phone       TEXT NOT NULL,
  city        TEXT,
  product     TEXT,   -- '30dias-basico', '30dias-estandar', 'pro-starter', etc.
  source      TEXT DEFAULT 'landing',  -- 'landing', 'ad', 'whatsapp', 'referral'
  message     TEXT,
  status      TEXT DEFAULT 'new',  -- 'new', 'contacted', 'converted', 'lost'
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_leads_status    ON leads(status);
CREATE INDEX IF NOT EXISTS idx_leads_created   ON leads(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_leads_product   ON leads(product);

-- ── PLANS ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS plans (
  id               TEXT PRIMARY KEY,  -- '30dias-basico', 'pro-premium', 'nocomm'
  product          TEXT NOT NULL,     -- '30dias', 'pro', 'nocomm'
  name             TEXT NOT NULL,
  price_cop        INTEGER NOT NULL,
  billing          TEXT DEFAULT 'monthly',  -- 'monthly', 'onetime'
  properties_limit INTEGER,
  posts_per_month  INTEGER,
  features         JSONB,
  active           BOOLEAN DEFAULT true,
  created_at       TIMESTAMPTZ DEFAULT now()
);

-- Insertar planes
INSERT INTO plans (id, product, name, price_cop, billing, properties_limit, posts_per_month, features) VALUES
('30dias-basico',    '30dias', '30 Días Básico',         89000,   'monthly', 1,  12, '{"platforms":["instagram","facebook"],"ai_video":false,"analytics":false}'),
('30dias-estandar',  '30dias', '30 Días Estándar',      199000,   'monthly', 5,  20, '{"platforms":["instagram","facebook","stories"],"ai_video":true,"analytics":"weekly"}'),
('30dias-pro',       '30dias', '30 Días Pro Agencia',   399000,   'monthly', 20, 30, '{"platforms":["instagram","facebook","tiktok","stories"],"ai_video":true,"analytics":"realtime"}'),
('pro-starter',      'pro',    'Rentmies Pro Starter',  599000,   'monthly', 3,  30, '{"platforms":["instagram","facebook"],"ai_video":3,"meta_ads":true,"analytics":"basic","account_manager":false}'),
('pro-premium',      'pro',    'Rentmies Pro Premium', 1200000,   'monthly', null, 80, '{"platforms":["instagram","facebook","google","tiktok"],"ai_video":true,"meta_ads":true,"google_ads":true,"analytics":"full","account_manager":true,"ad_budget_included":200000}'),
('nocomm',           'nocomm', 'Sin Comisión',          149000,   'onetime', 1,  12, '{"platforms":["instagram","facebook"],"ai_video":false,"listing_page":true,"portal_listing":true,"guarantee":"30day_refund"}')
ON CONFLICT (id) DO UPDATE SET
  price_cop = EXCLUDED.price_cop,
  features  = EXCLUDED.features,
  active    = EXCLUDED.active;

-- ── SUBSCRIPTIONS ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS subscriptions (
  id                UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id         UUID REFERENCES clients(id) ON DELETE SET NULL,
  plan_id           TEXT REFERENCES plans(id),
  status            TEXT DEFAULT 'pending',  -- pending, active, paused, cancelled, expired
  start_date        TIMESTAMPTZ,
  end_date          TIMESTAMPTZ,
  payment_reference TEXT,        -- Stripe session ID, Wompi reference, etc.
  amount_paid       INTEGER,     -- en COP
  next_billing_date TIMESTAMPTZ,
  cancelled_at      TIMESTAMPTZ,
  cancel_reason     TEXT,
  meta              JSONB,
  created_at        TIMESTAMPTZ DEFAULT now(),
  updated_at        TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_client ON subscriptions(client_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_subscriptions_next   ON subscriptions(next_billing_date);

-- ── CONTENT CALENDAR (30-day scheduler) ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS content_calendar (
  id               UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  subscription_id  UUID REFERENCES subscriptions(id) ON DELETE CASCADE,
  property_id      UUID REFERENCES properties(id) ON DELETE SET NULL,
  post_date        DATE NOT NULL,
  platform         TEXT NOT NULL,       -- 'instagram', 'facebook', 'instagram_story', 'tiktok'
  content_type     TEXT DEFAULT 'image', -- 'image', 'video', 'carousel', 'story'
  caption          TEXT,
  image_url        TEXT,                 -- generada o subida por el cliente
  headline         TEXT,
  variation        TEXT,                 -- 'urgency', 'outcome', 'social', 'brand_*'
  status           TEXT DEFAULT 'scheduled', -- scheduled, generating, published, failed, skipped
  post_id          TEXT,                 -- ID del post en la plataforma
  error_message    TEXT,
  metrics          JSONB,                -- {impressions, reach, likes, comments, saves}
  created_at       TIMESTAMPTZ DEFAULT now(),
  published_at     TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_calendar_date   ON content_calendar(post_date);
CREATE INDEX IF NOT EXISTS idx_calendar_status ON content_calendar(status);
CREATE INDEX IF NOT EXISTS idx_calendar_sub    ON content_calendar(subscription_id);

-- ── NOCOMM LISTINGS (Sin Comisión) ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS nocomm_listings (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id       UUID REFERENCES clients(id) ON DELETE SET NULL,
  subscription_id UUID REFERENCES subscriptions(id) ON DELETE SET NULL,
  property_type   TEXT NOT NULL,   -- 'apartamento', 'casa', 'lote', 'local', 'oficina'
  city            TEXT NOT NULL,
  neighborhood    TEXT,
  price           BIGINT,          -- en COP
  area            INTEGER,         -- m²
  bedrooms        INTEGER,
  bathrooms       INTEGER,
  description     TEXT,
  seller_name     TEXT NOT NULL,
  seller_phone    TEXT NOT NULL,
  seller_email    TEXT,
  images          TEXT[],
  listing_slug    TEXT UNIQUE,     -- para la URL pública: /inmueble/{slug}
  status          TEXT DEFAULT 'pending',  -- pending, active, sold, expired, cancelled
  views           INTEGER DEFAULT 0,
  leads_count     INTEGER DEFAULT 0,
  campaign_start  TIMESTAMPTZ,
  campaign_end    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_nocomm_city    ON nocomm_listings(city);
CREATE INDEX IF NOT EXISTS idx_nocomm_status  ON nocomm_listings(status);
CREATE INDEX IF NOT EXISTS idx_nocomm_slug    ON nocomm_listings(listing_slug);

-- ── PAYMENTS (registro de todos los pagos) ───────────────────────────────────
CREATE TABLE IF NOT EXISTS payments (
  id               UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  subscription_id  UUID REFERENCES subscriptions(id) ON DELETE SET NULL,
  client_id        UUID REFERENCES clients(id) ON DELETE SET NULL,
  plan_id          TEXT,
  amount_cop       INTEGER NOT NULL,
  currency         TEXT DEFAULT 'COP',
  provider         TEXT,            -- 'stripe', 'wompi', 'manual', 'whatsapp'
  provider_ref     TEXT UNIQUE,     -- ID externo del proveedor
  status           TEXT DEFAULT 'pending',  -- pending, completed, failed, refunded
  refunded_at      TIMESTAMPTZ,
  refund_reason    TEXT,
  created_at       TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payments_client ON payments(client_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);

-- ── UPDATE clients TABLE ──────────────────────────────────────────────────────
-- Ampliar la columna plan para los nuevos productos
ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS company TEXT,
  ADD COLUMN IF NOT EXISTS tipo_cliente TEXT DEFAULT 'agente',  -- agente, inmobiliaria, constructora, particular
  ADD COLUMN IF NOT EXISTS whatsapp TEXT;

-- ── ROW LEVEL SECURITY ────────────────────────────────────────────────────────
ALTER TABLE leads             ENABLE ROW LEVEL SECURITY;
ALTER TABLE plans             ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions     ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_calendar  ENABLE ROW LEVEL SECURITY;
ALTER TABLE nocomm_listings   ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments          ENABLE ROW LEVEL SECURITY;

-- Política pública para plans (todos pueden leer)
CREATE POLICY IF NOT EXISTS "plans_public_read" ON plans FOR SELECT USING (true);

-- Service role bypass para el backend (usa service_role_key)
-- Las políticas de usuario se agregan cuando se implemente auth de clientes

-- ── STORAGE BUCKETS ───────────────────────────────────────────────────────────
-- Ejecutar en Dashboard > Storage > Create Bucket:
--   Bucket: "nocomm-images"   → público, para fotos de inmuebles Sin Comisión
--   Bucket: "generated-content" → privado, para imágenes/videos generados con IA

-- ── VIEWS ÚTILES ─────────────────────────────────────────────────────────────

-- Dashboard: leads recientes con plan
CREATE OR REPLACE VIEW leads_dashboard AS
SELECT
  l.id, l.name, l.phone, l.email, l.city,
  l.product, l.source, l.status, l.created_at,
  p.name AS plan_name, p.price_cop
FROM leads l
LEFT JOIN plans p ON l.product = p.id
ORDER BY l.created_at DESC;

-- Dashboard: suscripciones activas
CREATE OR REPLACE VIEW subscriptions_active AS
SELECT
  s.id, s.plan_id, s.status, s.start_date, s.end_date,
  s.amount_paid, s.next_billing_date,
  c.name AS client_name, c.email AS client_email, c.phone AS client_phone,
  p.name AS plan_name, p.product
FROM subscriptions s
JOIN clients c ON s.client_id = c.id
JOIN plans p   ON s.plan_id   = p.id
WHERE s.status = 'active';

-- Dashboard: calendar posts de hoy
CREATE OR REPLACE VIEW todays_posts AS
SELECT
  cc.id, cc.platform, cc.content_type, cc.caption,
  cc.image_url, cc.status, cc.post_date,
  pr.tipo AS property_type, pr.ciudad,
  c.name AS client_name, c.phone AS client_phone
FROM content_calendar cc
LEFT JOIN properties pr ON cc.property_id = pr.id
LEFT JOIN subscriptions s ON cc.subscription_id = s.id
LEFT JOIN clients c ON s.client_id = c.id
WHERE cc.post_date = CURRENT_DATE
ORDER BY cc.platform, cc.content_type;

-- ── FUNCTIONS ────────────────────────────────────────────────────────────────

-- Función para activar suscripción tras pago exitoso
CREATE OR REPLACE FUNCTION activate_subscription(
  p_payment_ref TEXT,
  p_client_id   UUID DEFAULT NULL
)
RETURNS void AS $$
BEGIN
  UPDATE subscriptions
  SET
    status     = 'active',
    start_date = now(),
    end_date   = CASE
      WHEN plan_id = 'nocomm' THEN now() + INTERVAL '30 days'
      ELSE now() + INTERVAL '1 month'
    END,
    next_billing_date = CASE
      WHEN plan_id = 'nocomm' THEN NULL
      ELSE now() + INTERVAL '1 month'
    END,
    updated_at = now()
  WHERE payment_reference = p_payment_ref;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Función para contar leads por producto en los últimos 30 días
CREATE OR REPLACE FUNCTION leads_by_product()
RETURNS TABLE(product TEXT, count BIGINT, last_7d BIGINT) AS $$
SELECT
  product,
  COUNT(*) AS count,
  COUNT(*) FILTER (WHERE created_at >= now() - INTERVAL '7 days') AS last_7d
FROM leads
GROUP BY product
ORDER BY count DESC;
$$ LANGUAGE sql;

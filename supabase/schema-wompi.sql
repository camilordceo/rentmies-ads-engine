-- ════════════════════════════════════════════════════════════════
-- RENTMIES — Wompi Subscriptions Schema
-- Pagos via Wompi (Bancolombia). Soporta one-time + subscriptions
-- recurrentes con payment_source_id reutilizable.
-- Safe to run multiple times — idempotent.
-- ════════════════════════════════════════════════════════════════

-- ── subscriptions ─────────────────────────────────────────────
-- Una empresa puede tener UNA subscription activa a la vez.
-- Si cambia de plan, se actualiza la fila (no se crea nueva).
CREATE TABLE IF NOT EXISTS subscriptions (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id               UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,

  -- Plan vigente (matchea wompi-plans.js: 'starter' | 'growth' | 'scale')
  plan_code                TEXT NOT NULL,
  plan_price_cop_cents     INT NOT NULL,
  plan_quotas              JSONB NOT NULL,    -- { posts, images, videos }

  -- Estado del ciclo de cobro
  status                   TEXT NOT NULL DEFAULT 'pending',
                           -- 'pending' (esperando primer pago)
                           -- 'active'  (vigente, periodo abierto)
                           -- 'past_due' (cobro fallido, en gracia)
                           -- 'canceled' (usuario canceló, expira al final del periodo)
                           -- 'expired' (no se renovó)

  current_period_start     TIMESTAMPTZ,
  current_period_end       TIMESTAMPTZ,       -- cuando expira / debe renovar
  canceled_at              TIMESTAMPTZ,
  cancel_at_period_end     BOOLEAN DEFAULT FALSE,

  -- Payment source vigente para auto-renovación (Wompi 3RI)
  payment_source_id        INT,
  payment_source_card_brand TEXT,
  payment_source_last_four TEXT,
  payment_source_status    TEXT,              -- AVAILABLE | PENDING | DECLINED | ERROR

  -- Audit
  customer_email           TEXT NOT NULL,
  last_renewal_attempt_at  TIMESTAMPTZ,
  last_renewal_error       TEXT,
  created_at               TIMESTAMPTZ DEFAULT NOW(),
  updated_at               TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(empresa_id)
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_status
  ON subscriptions (status);
CREATE INDEX IF NOT EXISTS idx_subscriptions_period_end
  ON subscriptions (current_period_end)
  WHERE status IN ('active', 'past_due');

-- ── wompi_transactions ────────────────────────────────────────
-- Log inmutable de cada transacción Wompi (one-time + recurring renewals).
CREATE TABLE IF NOT EXISTS wompi_transactions (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id                UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  subscription_id           UUID REFERENCES subscriptions(id) ON DELETE SET NULL,

  -- Wompi identifiers
  reference                 TEXT NOT NULL UNIQUE,    -- RM-{plan}-{empresaId}-{ts}
  wompi_transaction_id      TEXT,                    -- transaction.id from Wompi
  payment_source_id         INT,

  -- Charge details
  amount_in_cents           INT NOT NULL,
  currency                  TEXT NOT NULL DEFAULT 'COP',
  plan_code                 TEXT,
  customer_email            TEXT NOT NULL,
  kind                      TEXT NOT NULL,           -- 'initial' | 'renewal' | 'one_time'

  -- Status: PENDING → APPROVED | DECLINED | ERROR | VOIDED
  status                    TEXT NOT NULL DEFAULT 'PENDING',
  status_message            TEXT,
  payment_method_type       TEXT,                    -- CARD, NEQUI, etc.
  card_brand                TEXT,
  card_last_four            TEXT,
  finalized_at              TIMESTAMPTZ,

  -- Raw payload del evento más reciente (para debugging)
  raw_event                 JSONB,

  created_at                TIMESTAMPTZ DEFAULT NOW(),
  updated_at                TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wompi_transactions_empresa
  ON wompi_transactions (empresa_id);
CREATE INDEX IF NOT EXISTS idx_wompi_transactions_status
  ON wompi_transactions (status);
CREATE INDEX IF NOT EXISTS idx_wompi_transactions_wompi_id
  ON wompi_transactions (wompi_transaction_id);

-- ── usage_counters ─────────────────────────────────────────────
-- Quotas consumidas en el periodo actual. Reset al renovar.
CREATE TABLE IF NOT EXISTS usage_counters (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id        UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  subscription_id   UUID REFERENCES subscriptions(id) ON DELETE CASCADE,
  period_start      TIMESTAMPTZ NOT NULL,
  period_end        TIMESTAMPTZ NOT NULL,
  posts_used        INT NOT NULL DEFAULT 0,
  images_used       INT NOT NULL DEFAULT 0,
  videos_used       INT NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(empresa_id, period_start)
);

CREATE INDEX IF NOT EXISTS idx_usage_counters_empresa
  ON usage_counters (empresa_id);

-- ── RLS ────────────────────────────────────────────────────────
ALTER TABLE subscriptions       ENABLE ROW LEVEL SECURITY;
ALTER TABLE wompi_transactions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_counters      ENABLE ROW LEVEL SECURITY;
-- Service role bypassa RLS — el frontend no lee estas tablas directo, va via API.

-- ── Vista útil: subscriptions a punto de renovar ───────────────
CREATE OR REPLACE VIEW subscriptions_due_for_renewal AS
SELECT
  s.id,
  s.empresa_id,
  s.plan_code,
  s.plan_price_cop_cents,
  s.payment_source_id,
  s.customer_email,
  s.current_period_end,
  s.status,
  s.last_renewal_attempt_at,
  EXTRACT(EPOCH FROM (s.current_period_end - NOW())) / 3600 AS hours_until_expiry
FROM subscriptions s
WHERE s.status IN ('active', 'past_due')
  AND s.payment_source_id IS NOT NULL
  AND s.cancel_at_period_end = FALSE
  AND s.current_period_end < NOW() + INTERVAL '24 hours';

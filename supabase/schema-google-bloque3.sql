-- ════════════════════════════════════════════════════════════════
-- RENTMIES — Google Ads Bloque 3 schema extensions
-- Builds on schema-multichannel.sql (which already created
-- google_connections, google_campaigns, google_lead_forms,
-- google_leads). Adds Camilord recommendations + a few helper
-- fields the API integration needs.
-- ════════════════════════════════════════════════════════════════

-- ── google_connections additions ─────────────────────────────────
ALTER TABLE google_connections
  ADD COLUMN IF NOT EXISTS is_test_account     BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS oauth_state_token   TEXT,                  -- pending CSRF state during the OAuth round-trip
  ADD COLUMN IF NOT EXISTS oauth_state_expires TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_error_at       TIMESTAMPTZ;

-- ── google_campaigns additions ───────────────────────────────────
ALTER TABLE google_campaigns
  ADD COLUMN IF NOT EXISTS final_url           TEXT,                  -- landing page sent to all assets
  ADD COLUMN IF NOT EXISTS audience_signals    JSONB DEFAULT '[]',    -- chips selected in the creator UI
  ADD COLUMN IF NOT EXISTS search_themes       JSONB DEFAULT '[]',    -- editable keywords
  ADD COLUMN IF NOT EXISTS asset_group_resource_name TEXT,
  ADD COLUMN IF NOT EXISTS lead_form_resource_name   TEXT,
  ADD COLUMN IF NOT EXISTS metrics_last_synced_at    TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_google_campaigns_inventario
  ON google_campaigns (inventario_id) WHERE inventario_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_google_campaigns_metrics_synced
  ON google_campaigns (metrics_last_synced_at) WHERE metrics_last_synced_at IS NOT NULL;

-- ── google_recommendations ───────────────────────────────────────
-- Camilord's actionable suggestions, refreshed by a 6-hourly cron.
-- The UI reads this table; clicking "apply" calls back to the API
-- which mutates the campaign.
CREATE TABLE IF NOT EXISTS google_recommendations (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id           UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  google_campaign_id   UUID REFERENCES google_campaigns(id) ON DELETE CASCADE,

  kind                 TEXT NOT NULL,               -- 'scale_budget' | 'pause_underperformer' | 'add_audience' | 'try_headline' | 'reallocate_spend' | 'lower_target_cpa'
  severity             TEXT NOT NULL DEFAULT 'info',-- 'info' | 'warn' | 'urgent'
  title                TEXT NOT NULL,
  body                 TEXT NOT NULL,
  detected_at          TIMESTAMPTZ DEFAULT NOW(),
  expires_at           TIMESTAMPTZ,                 -- recommendation goes stale after N days

  -- Suggested action (consumed by the "apply" handler)
  action_kind          TEXT,                        -- 'mutate_budget' | 'pause' | 'add_audience' | 'add_asset' | etc
  action_params        JSONB DEFAULT '{}',

  -- Lifecycle
  status               TEXT NOT NULL DEFAULT 'open',-- 'open' | 'applied' | 'dismissed' | 'expired'
  applied_at           TIMESTAMPTZ,
  dismissed_at         TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_google_recommendations_empresa_status
  ON google_recommendations (empresa_id, status);
CREATE INDEX IF NOT EXISTS idx_google_recommendations_campaign
  ON google_recommendations (google_campaign_id) WHERE google_campaign_id IS NOT NULL;

ALTER TABLE google_recommendations ENABLE ROW LEVEL SECURITY;

-- ── Helpful view: recent metrics per campaign ────────────────────
-- The list page reads this for the table rows; sync job fills it.
CREATE OR REPLACE VIEW google_campaign_metrics_recent AS
SELECT
  c.id,
  c.empresa_id,
  c.name,
  c.campaign_type,
  c.status,
  c.budget_amount_micros,
  c.budget_currency_code,
  c.bidding_strategy,
  c.target_cpa_micros,
  c.impressions,
  c.clicks,
  c.cost_micros,
  c.conversions,
  c.cost_per_conversion_micros,
  c.metrics_last_synced_at,
  c.created_at,
  CASE WHEN c.clicks > 0 THEN c.cost_micros::numeric / c.clicks ELSE 0 END AS cpc_micros,
  CASE WHEN c.impressions > 0 THEN c.clicks::numeric / c.impressions ELSE 0 END AS ctr,
  CASE WHEN c.conversions > 0 THEN c.cost_micros::numeric / c.conversions ELSE 0 END AS cpa_micros,
  CASE
    WHEN c.target_cpa_micros IS NOT NULL AND c.target_cpa_micros > 0 AND c.conversions > 0
      THEN (c.cost_micros::numeric / c.conversions) / c.target_cpa_micros
    ELSE NULL
  END AS cpa_ratio_to_target
FROM google_campaigns c
WHERE c.status != 'REMOVED';

-- ── updated_at triggers for the new table ────────────────────────
-- Postgres 14+ supports CREATE OR REPLACE TRIGGER, so we avoid the
-- DROP-then-CREATE pattern (Supabase flags raw DROP as destructive).
CREATE OR REPLACE TRIGGER trg_google_recommendations_touched
  BEFORE UPDATE ON google_recommendations
  FOR EACH ROW EXECUTE FUNCTION rentmies_set_updated_at();

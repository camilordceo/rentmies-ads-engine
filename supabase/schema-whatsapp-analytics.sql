-- ════════════════════════════════════════════════════════════════
-- RENTMIES — WhatsApp template analytics columns (idempotente)
--
-- Adds the two columns that /api/whatsapp/templates/analytics writes when
-- it pulls per-template performance from Meta's template_analytics endpoint.
-- The base counters (sent_count, delivered_count, read_count) already exist
-- from schema-whatsapp-bloque2.sql; this only adds clicks + the freshness
-- stamp. Safe to re-run.
-- ════════════════════════════════════════════════════════════════

ALTER TABLE whatsapp_templates
  ADD COLUMN IF NOT EXISTS clicked_count        INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS analytics_updated_at TIMESTAMPTZ;

-- Refresh the PostgREST schema cache so supabase-js sees the new columns
-- immediately (otherwise: "Could not find the 'clicked_count' column ...").
NOTIFY pgrst, 'reload schema';

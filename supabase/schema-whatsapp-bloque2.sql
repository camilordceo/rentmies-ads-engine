-- ════════════════════════════════════════════════════════════════
-- RENTMIES — WhatsApp Bloque 2 schema extensions
-- Extends whatsapp_templates (Step 11) and whatsapp_broadcasts
-- (Step 17) with the columns needed for live sync, send-rate
-- tracking, and CSV-driven broadcasts. All ADD COLUMN clauses are
-- IF NOT EXISTS so this script is safe to re-run after the base
-- schema-multichannel.sql has applied.
-- ════════════════════════════════════════════════════════════════

-- ── whatsapp_templates ───────────────────────────────────────────
-- Step 11 additions: send-rate counters + Meta quality_score +
-- legacy alias `status_reason` (we already have `rejection_reason`,
-- but Meta's webhook payload calls the field `reason`, so we expose
-- both names — DB stores in rejection_reason, view aliases below).

ALTER TABLE whatsapp_templates
  ADD COLUMN IF NOT EXISTS quality_score      TEXT,                -- HIGH | MEDIUM | LOW (from Meta)
  ADD COLUMN IF NOT EXISTS sent_count         INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS delivered_count    INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS read_count         INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_synced_at     TIMESTAMPTZ;

-- Indices required by the list page (filtering + categoría chips)
CREATE INDEX IF NOT EXISTS idx_whatsapp_templates_status_empresa
  ON whatsapp_templates (empresa_id, status);

CREATE INDEX IF NOT EXISTS idx_whatsapp_templates_category_empresa
  ON whatsapp_templates (empresa_id, category);

-- ── whatsapp_broadcasts ──────────────────────────────────────────
-- Step 17 additions: media_handle (Meta's media_id once uploaded)
-- and media_url (Supabase Storage URL the user provided).

ALTER TABLE whatsapp_broadcasts
  ADD COLUMN IF NOT EXISTS media_handle       TEXT,                -- Meta media_id (uploaded via Resumable Upload API)
  ADD COLUMN IF NOT EXISTS media_url          TEXT,                -- Source URL the user uploaded
  ADD COLUMN IF NOT EXISTS media_kind         TEXT,                -- 'image' | 'video' | 'document'
  ADD COLUMN IF NOT EXISTS sending_speed      INTEGER DEFAULT 5,   -- messages/second (1, 5, 10)
  ADD COLUMN IF NOT EXISTS opt_in_attested    BOOLEAN DEFAULT FALSE,  -- compliance: user attested they have opt-in
  ADD COLUMN IF NOT EXISTS opt_in_attested_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS opt_in_attested_by_user_id UUID,
  ADD COLUMN IF NOT EXISTS last_processor_run_at      TIMESTAMPTZ; -- when the cron processor last ticked this broadcast

CREATE INDEX IF NOT EXISTS idx_wa_broadcasts_status_scheduled
  ON whatsapp_broadcasts (status, scheduled_at)
  WHERE status IN ('scheduled', 'sending');

-- ── whatsapp_broadcast_recipients ────────────────────────────────
-- Add a phone_number alias (PRD's spec uses phone_number; existing
-- column is phone_e164). We keep phone_e164 as canonical and expose
-- a generated column so consumers that read either name work.
-- (Generated columns are read-only — writers must use phone_e164.)

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'whatsapp_broadcast_recipients'
      AND column_name = 'phone_number'
  ) THEN
    ALTER TABLE whatsapp_broadcast_recipients
      ADD COLUMN phone_number TEXT GENERATED ALWAYS AS (phone_e164) STORED;
  END IF;
END
$$;

-- ── Convenience view for the list page KPIs ──────────────────────
-- The Step 12 KPI tiles read these counts. View not strictly needed
-- but keeps the SQL out of the API handler.

CREATE OR REPLACE VIEW whatsapp_template_stats AS
SELECT
  empresa_id,
  COUNT(*) FILTER (WHERE TRUE)                        AS total,
  COUNT(*) FILTER (WHERE status = 'APPROVED')         AS approved,
  COUNT(*) FILTER (WHERE status = 'PENDING')          AS pending,
  COUNT(*) FILTER (WHERE status = 'REJECTED')         AS rejected,
  COUNT(*) FILTER (WHERE status = 'DRAFT')            AS draft,
  COUNT(*) FILTER (WHERE status IN ('PAUSED','DISABLED')) AS paused,
  COUNT(*) FILTER (WHERE category = 'MARKETING')      AS marketing,
  COUNT(*) FILTER (WHERE category = 'UTILITY')        AS utility,
  COUNT(*) FILTER (WHERE category = 'AUTHENTICATION') AS authentication
FROM whatsapp_templates
GROUP BY empresa_id;

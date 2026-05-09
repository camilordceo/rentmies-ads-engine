-- ════════════════════════════════════════════════════════════════
-- RENTMIES — Video library schema
-- Central inventory of videos uploaded by an empresa, with
-- platform-compatibility flags so Quick Post / Campaign Builder
-- can filter the library to only show videos that match the
-- target placement (IG Reels needs 9:16 ≤ 90s, FB Feed allows
-- 16:9 ≤ 240min, etc.).
--
-- Storage:
--   bucket: 'videos-upload' (already exists, public, 250MB limit).
--   Each row's storage_path is the path inside that bucket.
--
-- Idempotent: safe to run multiple times.
-- ════════════════════════════════════════════════════════════════

-- ── media_videos ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS media_videos (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id                  UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  inventario_id               UUID,                    -- optional FK to inmuebles

  -- Authoring
  title                       TEXT NOT NULL,
  description                 TEXT,
  tags                        TEXT[] DEFAULT '{}',

  -- Storage (always lives in Supabase 'videos-upload' bucket)
  storage_bucket              TEXT NOT NULL DEFAULT 'videos-upload',
  storage_path                TEXT NOT NULL,           -- '{empresa_id}/{uuid}.mp4'
  source_url                  TEXT NOT NULL,           -- public Supabase URL
  thumbnail_url               TEXT,                    -- optional poster image

  -- Metadata extracted client-side from the <video> element
  duration_sec                NUMERIC(8,2),
  width                       INT,
  height                      INT,
  aspect_ratio                TEXT,                    -- '9:16' | '1:1' | '4:5' | '16:9'
  orientation                 TEXT,                    -- 'vertical' | 'square' | 'horizontal'
  file_size_bytes             BIGINT,
  mime_type                   TEXT DEFAULT 'video/mp4',

  -- Platform compatibility (computed from aspect + duration)
  -- Set by the /confirm endpoint based on width/height/duration.
  compat_ig_feed              BOOLEAN DEFAULT FALSE,   -- 1:1, 4:5 ≤ 60s
  compat_ig_reels             BOOLEAN DEFAULT FALSE,   -- 9:16 ≤ 90s
  compat_ig_stories           BOOLEAN DEFAULT FALSE,   -- 9:16 ≤ 60s
  compat_fb_feed              BOOLEAN DEFAULT FALSE,   -- 16:9, 1:1, 4:5 ≤ 240min
  compat_fb_reels             BOOLEAN DEFAULT FALSE,   -- 9:16 ≤ 90s
  compat_tiktok               BOOLEAN DEFAULT FALSE,   -- 9:16 ≤ 60s

  -- AI cache (so Camilord doesn't re-generate captions every time)
  ai_captions                 JSONB DEFAULT '{}',      -- { instagram: '...', facebook: '...' }
  ai_caption_generated_at     TIMESTAMPTZ,

  -- Lifecycle
  status                      TEXT NOT NULL DEFAULT 'ready',  -- 'pending' | 'ready' | 'failed' | 'archived'
  usage_count                 INT DEFAULT 0,
  last_used_at                TIMESTAMPTZ,

  -- Audit
  created_by_user_id          UUID,
  created_at                  TIMESTAMPTZ DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_media_videos_empresa_status
  ON media_videos (empresa_id, status);
CREATE INDEX IF NOT EXISTS idx_media_videos_inventario
  ON media_videos (inventario_id) WHERE inventario_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_media_videos_orientation
  ON media_videos (empresa_id, orientation);
CREATE INDEX IF NOT EXISTS idx_media_videos_created
  ON media_videos (empresa_id, created_at DESC);
-- For tag search
CREATE INDEX IF NOT EXISTS idx_media_videos_tags
  ON media_videos USING GIN (tags);

ALTER TABLE media_videos ENABLE ROW LEVEL SECURITY;

-- ── published_posts.media_video_id ──────────────────────────────
-- Optional FK from a published post back to its source video so
-- usage_count can be incremented and the library can show "this
-- video has been published 3× to IG, 1× to FB".
--
-- Make sure published_posts exists with the columns the trigger
-- function and the view need. Normally created in full by
-- schema-meta-oauth.sql; this defensive create lets schema-videos
-- run on a Supabase that hasn't applied the meta-oauth schema yet.
CREATE TABLE IF NOT EXISTS published_posts (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id           UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  inventario_id        UUID,
  platform             TEXT NOT NULL,
  caption              TEXT,
  media_url            TEXT,
  media_kind           TEXT,
  post_id              TEXT,
  post_permalink       TEXT,
  status               TEXT DEFAULT 'published',
  error_message        TEXT,
  scheduled_at         TIMESTAMPTZ,
  published_at         TIMESTAMPTZ,
  created_at           TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE published_posts
  ADD COLUMN IF NOT EXISTS media_video_id UUID REFERENCES media_videos(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_published_posts_media_video
  ON published_posts (media_video_id) WHERE media_video_id IS NOT NULL;

-- ── updated_at trigger ──────────────────────────────────────────
-- Postgres 14+ supports CREATE OR REPLACE TRIGGER, so no DROP first.
CREATE OR REPLACE TRIGGER trg_media_videos_updated_at
  BEFORE UPDATE ON media_videos
  FOR EACH ROW EXECUTE FUNCTION rentmies_set_updated_at();

-- ── usage_count auto-increment ──────────────────────────────────
-- When a published_posts row is inserted with a media_video_id,
-- bump the source video's usage_count and last_used_at.
CREATE OR REPLACE FUNCTION rentmies_bump_video_usage()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.media_video_id IS NOT NULL THEN
    UPDATE media_videos
       SET usage_count = COALESCE(usage_count, 0) + 1,
           last_used_at = NOW()
     WHERE id = NEW.media_video_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trg_published_posts_bump_video_usage
  AFTER INSERT ON published_posts
  FOR EACH ROW EXECUTE FUNCTION rentmies_bump_video_usage();

-- ── Helpful view ────────────────────────────────────────────────
-- "Videos library with usage stats" — what the library page reads.
CREATE OR REPLACE VIEW media_videos_with_stats AS
SELECT
  v.*,
  COUNT(pp.id) FILTER (WHERE pp.platform = 'instagram')        AS published_ig_count,
  COUNT(pp.id) FILTER (WHERE pp.platform LIKE 'instagram%')    AS published_ig_total,
  COUNT(pp.id) FILTER (WHERE pp.platform = 'facebook')         AS published_fb_count,
  COUNT(pp.id) FILTER (WHERE pp.status = 'published')          AS published_total
FROM media_videos v
LEFT JOIN published_posts pp ON pp.media_video_id = v.id
GROUP BY v.id;

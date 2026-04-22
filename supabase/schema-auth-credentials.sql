-- ════════════════════════════════════════════════════════════════
-- RENTMIES ADS ENGINE — Auth & Credentials Schema
-- Safe to run multiple times. No destructive operations.
-- ════════════════════════════════════════════════════════════════

-- ── Empresas (organizations/agencies) ──────────────────────────
CREATE TABLE IF NOT EXISTS empresas (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre      TEXT NOT NULL,
  plan        TEXT DEFAULT 'Starter',
  activo      BOOLEAN DEFAULT true,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ── Profiles (users linked to empresas) ────────────────────────
CREATE TABLE IF NOT EXISTS profiles (
  id                UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  empresa_id        UUID REFERENCES empresas(id),
  email             TEXT,
  nombre            TEXT,
  rol               TEXT DEFAULT 'Viewer',
  activo            BOOLEAN DEFAULT true,
  plan              TEXT DEFAULT 'Starter',
  credits_remaining INT DEFAULT 100,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

-- ── Platform Credentials (Meta, TikTok, Google AI, WhatsApp) ───
CREATE TABLE IF NOT EXISTS platform_credentials (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id       UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  platform         TEXT NOT NULL,   -- 'meta' | 'tiktok' | 'google_ai' | 'whatsapp'
  credentials      JSONB NOT NULL DEFAULT '{}',
  last_tested_at   TIMESTAMPTZ,
  last_test_status TEXT,            -- 'ok' | 'error'
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(empresa_id, platform)
);

-- ── Social Posts (track every post published via the platform) ──
CREATE TABLE IF NOT EXISTS social_posts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id    UUID REFERENCES empresas(id),
  inventario_id UUID,
  platform      TEXT NOT NULL,     -- 'facebook_page' | 'instagram'
  caption       TEXT,
  image_url     TEXT,
  post_id       TEXT,              -- Meta post ID returned by Graph API
  post_url      TEXT,
  status        TEXT DEFAULT 'published',
  published_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ── Row Level Security (enable only — no policies removed) ─────
ALTER TABLE empresas             ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles             ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_posts         ENABLE ROW LEVEL SECURITY;

-- ── Policies (only created if they don't already exist) ─────────
-- Uses a DO block to check pg_policies before creating.
-- No DROP, no TRUNCATE, no destructive operation anywhere.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'profiles'
      AND policyname = 'Users can read own profile'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "Users can read own profile"
        ON profiles FOR SELECT
        USING (auth.uid() = id)
    $policy$;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'profiles'
      AND policyname = 'Users can update own profile'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "Users can update own profile"
        ON profiles FOR UPDATE
        USING (auth.uid() = id)
    $policy$;
  END IF;
END
$$;

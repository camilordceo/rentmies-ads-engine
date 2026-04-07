-- ============================================================
-- RENTMIES ADS ENGINE — SUPABASE SCHEMA
-- Ejecuta esto en el SQL Editor de tu proyecto Supabase
-- ============================================================

-- Clientes (inmobiliarias / agentes)
CREATE TABLE IF NOT EXISTS clients (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name        TEXT NOT NULL,
  email       TEXT UNIQUE NOT NULL,
  phone       TEXT,
  plan        TEXT DEFAULT 'free', -- free, starter, pro
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

-- Inmuebles
CREATE TABLE IF NOT EXISTS properties (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id   UUID REFERENCES clients(id) ON DELETE CASCADE,
  project     TEXT,                        -- nombre del proyecto/edificio
  tipo        TEXT NOT NULL,               -- apartamento, casa, local
  ciudad      TEXT NOT NULL,               -- Bogotá, Medellín, Cali
  precio      BIGINT,                      -- precio mensual en COP
  area        INT,                         -- m²
  habitaciones INT,
  banos       INT,
  amenidades  TEXT[],                      -- piscina, gym, parqueadero...
  descripcion TEXT,
  status      TEXT DEFAULT 'disponible',  -- disponible, arrendado, vendido
  images      TEXT[],                     -- URLs públicas de fotos (Supabase Storage)
  video_url   TEXT,                       -- URL del video generado con IA
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

-- Tokens de redes sociales por cliente
CREATE TABLE IF NOT EXISTS social_tokens (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id     UUID REFERENCES clients(id) ON DELETE CASCADE,
  platform      TEXT NOT NULL,         -- 'tiktok', 'instagram', 'facebook'
  access_token  TEXT NOT NULL,
  refresh_token TEXT,
  open_id       TEXT,                  -- TikTok user open_id
  ig_user_id    TEXT,                  -- Instagram Business Account ID
  expires_at    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now(),
  UNIQUE(client_id, platform)
);

-- Historial de publicaciones
CREATE TABLE IF NOT EXISTS social_posts (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  property_id   UUID REFERENCES properties(id) ON DELETE SET NULL,
  client_id     UUID REFERENCES clients(id) ON DELETE CASCADE,
  platform      TEXT NOT NULL,          -- 'tiktok', 'instagram', 'facebook', 'meta_ads'
  format        TEXT NOT NULL,          -- 'video', 'image', 'carousel', 'ad'
  post_id       TEXT,                   -- ID del post en la plataforma
  publish_id    TEXT,                   -- TikTok publish_id para polling
  status        TEXT DEFAULT 'pending', -- pending, processing, published, failed
  caption       TEXT,
  media_url     TEXT,                   -- URL del video o imagen usada
  ad_headline   TEXT,
  ad_description TEXT,
  error_message TEXT,
  meta          JSONB,                  -- datos extras (campaign_id, adset_id, etc.)
  created_at    TIMESTAMPTZ DEFAULT now(),
  published_at  TIMESTAMPTZ
);

-- Videos generados con IA (Gemini Veo)
CREATE TABLE IF NOT EXISTS generated_videos (
  id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  property_id  UUID REFERENCES properties(id) ON DELETE CASCADE,
  client_id    UUID REFERENCES clients(id) ON DELETE CASCADE,
  prompt       TEXT,
  video_url    TEXT NOT NULL,           -- URL pública en Supabase Storage
  duration_sec INT,
  file_size_mb NUMERIC(6,2),
  model        TEXT DEFAULT 'veo-2.0-flash-exp',
  status       TEXT DEFAULT 'ready',   -- generating, ready, failed
  created_at   TIMESTAMPTZ DEFAULT now()
);

-- ── STORAGE BUCKETS (crear en Dashboard > Storage) ──
-- Bucket: "property-images"  → público, para fotos de inmuebles
-- Bucket: "property-videos"  → público, para videos generados con IA

-- ── RLS POLICIES (habilita Row Level Security en cada tabla) ──
ALTER TABLE clients         ENABLE ROW LEVEL SECURITY;
ALTER TABLE properties      ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_tokens   ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_posts    ENABLE ROW LEVEL SECURITY;
ALTER TABLE generated_videos ENABLE ROW LEVEL SECURITY;

-- Service role bypass (el backend usa service_role_key, ignora RLS)
-- Las políticas de acceso de usuarios finales se agregan según auth implementada

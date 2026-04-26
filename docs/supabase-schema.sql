-- ─────────────────────────────────────────────────────────────
-- RENTMIES ADS ENGINE — SUPABASE SCHEMA
-- Tablas opcionales para FASE 3 (persistencia de campañas + logs IA).
-- Hasta que las crees, el dashboard funciona contra localStorage.
-- Run from the SQL Editor in your Supabase project.
-- ─────────────────────────────────────────────────────────────

-- Enable uuid generation
create extension if not exists "uuid-ossp";

-- ── ad_campaigns ─────────────────────────────────────────────
-- Campañas creadas desde Creative Studio + wizard de lanzamiento.

create table if not exists ad_campaigns (
  id uuid primary key default uuid_generate_v4(),
  empresa_id text not null,
  name text not null,
  status text not null default 'draft',  -- draft | scheduled | live | paused | done
  ciudad text,
  tipo_inmueble text,
  prompt_config jsonb default '{}'::jsonb,    -- description, price, location, angles, photo_count, photo_first
  platforms jsonb default '[]'::jsonb,        -- ['instagram','tiktok',...]
  budget jsonb default '{}'::jsonb,           -- { daily, total, duration_days, currency }
  schedule jsonb default '{}'::jsonb,         -- { when: 'now'|'tomorrow'|'custom', custom_date }
  source text default 'creative_studio',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_ad_campaigns_empresa on ad_campaigns(empresa_id);
create index if not exists idx_ad_campaigns_created on ad_campaigns(created_at desc);

-- ── ad_ai_logs ───────────────────────────────────────────────
-- Cada acción tomada por Camilord (generación, publicación, optim, pause).
-- Auditable + reversible desde la UI de History.

create table if not exists ad_ai_logs (
  id uuid primary key default uuid_generate_v4(),
  empresa_id text not null,
  campaign_id uuid references ad_campaigns(id) on delete cascade,
  ts timestamptz not null default now(),
  action text not null,            -- GEN | PUB | OPT | PAUSE
  target text,                     -- 'Villa Victoria — Estatus' or 'ad_8472'
  metric text,                     -- 'CTR pred 3.2%', 'CPL Δ -42%', etc.
  status text default 'done',      -- ready | live | done | paused
  why text,                        -- natural-language reasoning
  metrics jsonb default '{}'::jsonb,
  reverted boolean default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_ad_ai_logs_empresa on ad_ai_logs(empresa_id);
create index if not exists idx_ad_ai_logs_campaign on ad_ai_logs(campaign_id);
create index if not exists idx_ad_ai_logs_ts on ad_ai_logs(ts desc);

-- ── ad_performance_logs ──────────────────────────────────────
-- Snapshots diarios de impresiones / clics / conversiones / costo
-- por campaña. Feedea la página de Analytics.

create table if not exists ad_performance_logs (
  id uuid primary key default uuid_generate_v4(),
  empresa_id text not null,
  campaign_id uuid references ad_campaigns(id) on delete cascade,
  channel text not null,           -- instagram | facebook_page | tiktok | whatsapp
  date date not null,
  impressions integer default 0,
  clicks integer default 0,
  conversions integer default 0,
  spend_cop numeric(12,2) default 0,
  cpl numeric(8,2),                -- costo por lead (derivado)
  ctr numeric(5,2),                -- CTR % (derivado)
  created_at timestamptz not null default now()
);

create unique index if not exists ux_perf_campaign_channel_date
  on ad_performance_logs(campaign_id, channel, date);
create index if not exists idx_perf_empresa_date on ad_performance_logs(empresa_id, date desc);

-- ── RLS (Row Level Security) ─────────────────────────────────
-- Activa RLS y crea políticas básicas. Si usas SUPABASE_SERVICE_KEY
-- desde el servidor (lo que hace api/campaigns.js), service_role
-- bypassea RLS por defecto. Estas políticas son para acceso desde
-- el cliente (anon key).

alter table ad_campaigns        enable row level security;
alter table ad_ai_logs          enable row level security;
alter table ad_performance_logs enable row level security;

-- Lectura: cualquier authenticated user puede leer su propia empresa.
-- (Asume que profiles.empresa_id está poblada y tienes auth.uid() del JWT.)
do $$
begin
  if not exists (select 1 from pg_policies where policyname = 'ad_campaigns_read_own_empresa') then
    create policy ad_campaigns_read_own_empresa
      on ad_campaigns for select
      using (empresa_id in (select empresa_id from profiles where id = auth.uid()));
  end if;
  if not exists (select 1 from pg_policies where policyname = 'ad_ai_logs_read_own_empresa') then
    create policy ad_ai_logs_read_own_empresa
      on ad_ai_logs for select
      using (empresa_id in (select empresa_id from profiles where id = auth.uid()));
  end if;
  if not exists (select 1 from pg_policies where policyname = 'ad_performance_logs_read_own_empresa') then
    create policy ad_performance_logs_read_own_empresa
      on ad_performance_logs for select
      using (empresa_id in (select empresa_id from profiles where id = auth.uid()));
  end if;
end $$;

-- Inserts/updates desde el cliente NO se permiten — todo pasa por
-- el backend con service_role. Si quisieras permitir inserts desde
-- el cliente, agrega INSERT policies aquí.

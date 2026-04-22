# Rentmies Ads Engine

AI-powered ad generation and publishing platform for real estate agencies.
Part of the Rentmies Growth Suite. Built for inmobiliarias in Colombia.

## Features

- **Meta Publishing** — post to Facebook Page and Instagram Business
- **WhatsApp Template Analytics** — delivery, read, and click rates per template
- **AI Ad Generation** — Gemini creates copy in 4 psychological angles
- **Imagen 3 Visuals** — AI-generated property visuals per listing
- **Campaign Manager** — create, track, and analyze ad campaigns
- **Auto-pause** — Gemini pauses underperforming ads every 6h, scales winners
- **Inventario Import** — CSV/XLSX upload for property database
- **Multi-tenant** — multi-agency architecture with role-based access
- **Supabase Auth** — real login/signup, no mock credentials

## Routes

| Route | Description |
|---|---|
| `/` | Marketing landing page |
| `/login` | Sign in |
| `/signup` | Create account |
| `/app` | Authenticated dashboard |
| `/api/health` | Health check (env + DB status) |
| `/api/inventario` | Property CRUD |
| `/api/campaigns` | Campaign CRUD |
| `/api/creatives` | Creative CRUD |
| `/api/generate` | AI ad generation pipeline |
| `/api/whatsapp/templates` | Fetch WA templates from Meta |
| `/api/social-post` | Publish to Facebook/Instagram |
| `/api/credentials/:platform` | Save/load platform credentials |
| `/api/analytics/*` | Performance analytics |
| `/api/auth-supabase` | Auth (signup/signin/me/signout) |

## Local Setup

```bash
git clone https://github.com/camilordceo/rentmies-ads-engine
cd ads-generator
npm install
cp .env.example adsplatform.env
# Fill in adsplatform.env with real Supabase + Meta + Google keys
npm run dev
# Open http://localhost:3000
```

## Deployment

Deployed to Vercel. See [VERCEL_SETUP.md](VERCEL_SETUP.md) for environment variable setup.

```bash
git push origin main
# Vercel auto-deploys on push
```

## Stack

- **Node.js + Express** — local dev server (`local-server.js`)
- **Vercel Serverless Functions** — production (`api/*.js`)
- **Supabase** — auth + PostgreSQL database
- **Google Gemini 1.5 Flash** — ad copy generation
- **Google Imagen 3** — AI image generation
- **Meta Graph API v21** — Facebook/Instagram/WhatsApp
- **Vanilla JS** — dashboard frontend (no framework)

## Project Structure

```
ads-generator/
├── api/                    Vercel serverless functions
│   ├── auth-supabase.js    Supabase auth (signup/signin/me)
│   ├── health.js           Health check endpoint
│   ├── social-post.js      Publish to Facebook/Instagram
│   └── ...
├── config/                 AI prompts, campaign configs
├── dashboard/
│   └── index.html          App dashboard (post-auth)
├── engine/                 AI generators, analyzers
├── lib/                    Shared utilities
├── public/
│   ├── index.html          Marketing landing
│   ├── login.html          Sign in
│   └── signup.html         Create account
├── supabase/               Schema migrations
├── local-server.js         Express dev server
├── .env.example            Env var template
├── VERCEL_SETUP.md         Deployment guide
└── KNOWN_ISSUES.md         Pending work
```

## Supabase Schema

Run `supabase/schema-v2.sql` in Supabase SQL Editor to create all tables.

Required tables: `empresas`, `profiles`, `inventario_sql`, `ad_campaigns`, `ad_creatives`, `platform_credentials`, `social_posts`, `wa_template_logs`, `video_uploads`, `ai_decision_logs`

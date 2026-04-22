# Known Issues & Pending Work

## Current Limitations (next session to fix)

### Auth
- [ ] Password reset flow not built (needs Supabase email templates configured)
- [ ] Email confirmation can prevent immediate login (Supabase setting: disable email confirmation for dev)
- [ ] Session refresh on expiry not implemented (user must log in again after token expiry)
- [ ] No OAuth (Google login, Meta OAuth) — users paste tokens manually

### Meta Integration
- [ ] No OAuth flow for Meta — user pastes long-lived access token manually
- [ ] Token rotation not automated — long-lived tokens expire in ~60 days
- [ ] Instagram publish requires Instagram Business Account linked to Facebook Page
- [ ] Facebook Page access token vs User access token distinction not surfaced in UI

### Platform Coverage
- [ ] TikTok integration exists in engine/ but no OAuth UI for token acquisition
- [ ] Google Ads integration not connected to UI
- [ ] LinkedIn not supported

### AI Features
- [ ] Image generation (Imagen 3) exists in engine/imageGen.js but no UI trigger in dashboard
- [ ] Video generation (generate-video.js) exists but no frontend workflow
- [ ] Analyzer (auto-pause/scale) runs on cron but UI shows mock data until Supabase connected

### Database
- [ ] `platform_credentials` table may not exist — run supabase/schema-v2.sql first
- [ ] `social_posts` table needs to be created (track published posts)
- [ ] RLS policies not configured — using service role key bypasses all policies

### Other
- [ ] CSV import for inventario works but UI is basic (no progress indicator)
- [ ] Team invite emails not sent — just stored in DB
- [ ] No billing/subscription management
- [ ] Webhook for WhatsApp incoming messages not configured
- [ ] No rate limiting on API endpoints
- [ ] WebSocket does not work in Vercel serverless (works only in local dev)

## adsplatform.env.txt in parent directory
The file `C:\Users\camil\rentmies-growth-agents\adsplatform.env.txt` contains REAL Meta and Google credentials.

**Action required:** Rotate these keys immediately:
1. Google AI API Key — go to aistudio.google.com → API Keys → Delete and recreate
2. Meta App Secret — go to developers.facebook.com → App Settings → Regenerate

This file is outside the git repo so it is NOT in version control, but it is on disk in plaintext.

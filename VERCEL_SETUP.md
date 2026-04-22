# Rentmies Ads Engine — Vercel Setup Guide

## Environment Variables to Configure

Go to: **vercel.com → your project → Settings → Environment Variables**

Add each variable below. Apply to **Production**, **Preview**, and **Development**.

| Variable | Description | Required |
|---|---|---|
| `SUPABASE_URL` | Project URL from Supabase → Settings → API | ✅ |
| `SUPABASE_ANON_KEY` | Anon/Public key from Supabase → Settings → API | ✅ |
| `SUPABASE_SERVICE_KEY` | Service Role key from Supabase → Settings → API | ✅ |
| `GEMINI_API_KEY` | Google AI Studio key from aistudio.google.com | ✅ |
| `META_APP_ID` | From developers.facebook.com | ⬜ |
| `META_APP_SECRET` | From developers.facebook.com | ⬜ |
| `META_ACCESS_TOKEN` | Long-lived user or page token | ⬜ |
| `META_AD_ACCOUNT_ID` | Format: `act_XXXXXXXXX` | ⬜ |
| `META_PAGE_ID` | Facebook Page numeric ID | ⬜ |
| `META_WABA_ID` | WhatsApp Business Account ID | ⬜ |
| `META_PHONE_NUMBER_ID` | WhatsApp Phone Number ID | ⬜ |
| `APP_URL` | Your Vercel production URL (e.g. `https://ads.rentmies.co`) | ⬜ |
| `NODE_ENV` | `production` | ✅ |

## Step-by-Step

1. Open [vercel.com](https://vercel.com) and sign in
2. Select the **rentmies-ads-engine** project
3. Go to **Settings** tab → **Environment Variables**
4. Click **Add New**
5. Enter the variable name (exact, case-sensitive) and value
6. Select: **Production** ✓, **Preview** ✓, **Development** ✓
7. Click **Save**
8. Repeat for each variable
9. After adding all variables: go to **Deployments** → click **Redeploy** on the latest deployment

## Getting Supabase Keys

1. Go to [supabase.com](https://supabase.com) → your project
2. Settings → API
3. Copy **Project URL** → `SUPABASE_URL`
4. Copy **anon public** key → `SUPABASE_ANON_KEY`
5. Copy **service_role secret** key → `SUPABASE_SERVICE_KEY`

⚠️ Never commit these keys to git.

## Getting Meta Credentials

1. Go to [developers.facebook.com](https://developers.facebook.com)
2. Create or select your app
3. From App Dashboard: copy **App ID** and **App Secret**
4. Use Graph API Explorer to generate a long-lived **User Access Token**
   - Permissions needed: `pages_manage_posts`, `pages_read_engagement`, `instagram_basic`, `instagram_content_publish`, `whatsapp_business_management`
5. **Page ID**: Go to your Facebook Page → About → Page ID
6. **WABA ID**: Meta Business Suite → WhatsApp → Settings → Business Account ID
7. **Phone Number ID**: Meta Business Suite → WhatsApp → Phone Numbers

## Local Development

Instead of Vercel dashboard, use `adsplatform.env` file locally:

```bash
cp .env.example adsplatform.env
# Edit adsplatform.env with your real keys
npm run dev
```

The server auto-loads `adsplatform.env` when running locally.

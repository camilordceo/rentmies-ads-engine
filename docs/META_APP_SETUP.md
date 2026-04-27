# Meta App Setup — Rentmies Growth Suite

Guía paso a paso para configurar la Meta App una sola vez en
[developers.facebook.com](https://developers.facebook.com).

Después de completar esto, los agentes podrán conectarse vía
**"Continuar con Facebook"** desde `rentmies-ads-engine.vercel.app/signup` y publicar
en Facebook + Instagram + enviar plantillas de WhatsApp **sin pegar tokens manualmente.**

---

## 0. Pre-requisitos

Antes de empezar:

- [ ] Tienes acceso de admin a la cuenta de **Meta Business** de Rentmies.
- [ ] Las URLs legales de **rentmies.com** están vivas (Privacy / Terms / Data Deletion).
  Si todavía no, créalas como páginas estáticas mínimas — Meta exige que existan.
- [ ] Acceso al panel de Vercel para agregar env vars al proyecto `rentmies-ads-engine`.

---

## 1. Crear / abrir la App

1. Entra a [developers.facebook.com](https://developers.facebook.com) → **My Apps**.
2. Si ya existe la app de Rentmies, ábrela. Si no, crea una nueva:
   - **App type**: `Business`
   - **App name**: `Rentmies Growth Suite`
   - **App contact email**: tu correo de admin

Anota el **App ID** y **App Secret** (Settings → Basic). Ya están en `META_APP_ID`
y `META_APP_SECRET` de Vercel — verifica que coincidan.

---

## 2. Agregar productos

En el menú lateral izquierdo, click **+ Add Product** y agrega los tres:

1. **Facebook Login for Business** ← este es el nuevo, NO el Facebook Login clásico.
2. **Instagram Graph API**
3. **WhatsApp** (Business Platform / Cloud API)

Si la app ya tenía "Facebook Login" clásico, déjalo pero usa Login **for Business** para
el flujo nuevo — es el path soportado para apps SaaS.

---

## 3. Settings → Basic

| Campo | Valor |
|---|---|
| **Privacy Policy URL** | `https://rentmies.com/privacy` (debe estar live) |
| **Terms of Service URL** | `https://rentmies.com/terms` |
| **User Data Deletion URL** | `https://rentmies.com/data-deletion` |
| **Category** | Business and Pages |
| **App Domains** | `rentmies.com`, `rentmies-ads-engine.vercel.app` |
| **App Icon** | 1024×1024 PNG con el logo Rentmies |

Guarda. Sin estas URLs Meta bloquea App Review más adelante.

---

## 4. Facebook Login for Business → Settings

1. **Valid OAuth Redirect URIs** — agrega:
   ```
   https://rentmies-ads-engine.vercel.app/api/auth/meta/callback
   http://localhost:3000/api/auth/meta/callback
   ```
2. **Login from Devices**: OFF (no aplica)
3. **Embedded Browser OAuth Login**: ON
4. **Use Strict Mode for redirect URIs**: ON
5. Guarda.

---

## 5. Facebook Login for Business → Configurations

Aquí definimos **qué** permisos pide la app cuando alguien hace clic en "Continuar con Facebook".

1. Click **Create Configuration**.
2. Llena así:

| Campo | Valor |
|---|---|
| **Configuration name** | `Rentmies Connect` |
| **Login variation** | User access token |
| **Permissions** (asset permissions) | `pages_show_list`, `pages_manage_posts`, `pages_read_engagement`, `pages_manage_metadata`, `instagram_basic`, `instagram_content_publish`, `instagram_manage_insights`, `whatsapp_business_management`, `whatsapp_business_messaging`, `business_management`, `public_profile`, `email` |

3. Guarda.
4. Aparece un **Configuration ID** (string largo tipo `1234567890123456`).
   **Copia ese ID** — lo necesitamos en el siguiente paso.

---

## 6. Agregar env vars en Vercel

Ve a [vercel.com](https://vercel.com) → proyecto `rentmies-ads-engine` → **Settings → Environment Variables** y agrega:

| Variable | Valor | Environments |
|---|---|---|
| `META_APP_ID` | (Settings → Basic → App ID) | Production, Preview, Development |
| `META_APP_SECRET` | (Settings → Basic → App Secret) | Production, Preview, Development |
| `META_LOGIN_CONFIG_ID` | (paso 5 — Configuration ID) | Production, Preview, Development |
| `META_REDIRECT_URI` | `https://rentmies-ads-engine.vercel.app/api/auth/meta/callback` | Production |
| `META_REDIRECT_URI` | `http://localhost:3000/api/auth/meta/callback` | Development |
| `META_GRAPH_VERSION` | `v21.0` | Production, Preview, Development |
| `META_OAUTH_SECRET` | genera con `openssl rand -hex 32` | Production, Preview, Development |

`META_OAUTH_SECRET` se usa para firmar la cookie `state` de CSRF — debe ser secreta y única.

Despliega después de guardar las env vars (Vercel **no** auto-redeploy con cambios de env):
```sh
vercel deploy --prod --yes
```

---

## 7. Roles → Testers

Mientras la app esté en **Development Mode** (antes de App Review aprobado), solo
los usuarios listados como Testers pueden completar el flujo de OAuth.

1. Roles → **Testers** → **Add People** → ingresa el correo de Facebook del agente.
2. El agente recibe una invitación; debe aceptarla en
   [www.facebook.com/settings/?tab=business_tools](https://www.facebook.com/settings/?tab=business_tools).
3. Una vez aceptada, ese agente puede usar `https://rentmies-ads-engine.vercel.app/signup` y
   conectar su Página + Instagram.

**Límite**: 25 testers por app. Si necesitas más antes de App Review, considera
escalar a App Review cuanto antes (puede tomar 1-3 semanas).

---

## 8. Plantillas de App Review (cuándo)

Hay permisos que **requieren App Review** antes de poder usarse fuera de Development Mode.
Mientras estés en Dev Mode con Testers funciona todo, pero para abrir a usuarios públicos
necesitas Review aprobado de cada permiso.

| Permiso | App Review requerido |
|---|---|
| `pages_show_list` | ✅ Sí |
| `pages_manage_posts` | ✅ Sí |
| `pages_read_engagement` | ✅ Sí |
| `pages_manage_metadata` | ✅ Sí |
| `instagram_basic` | ✅ Sí |
| `instagram_content_publish` | ✅ Sí |
| `instagram_manage_insights` | ✅ Sí |
| `whatsapp_business_management` | ✅ Sí |
| `whatsapp_business_messaging` | ✅ Sí |
| `business_management` | ✅ Sí |
| `public_profile` | ❌ No |
| `email` | ❌ No |

Para Review necesitas:
- Video screencast del flujo end-to-end (60-90s).
- Justificación de uso de cada permiso ("Used to publish ads on behalf of property managers in Colombia").
- Privacy Policy live + Data Deletion endpoint funcional.
- App Verification completa de la empresa (Business Manager → Security Center).

**Recomendación**: lanzar primero con 10-25 Testers, capturar primeros revenue, después
arrancar App Review con datos reales para mostrar.

---

## 9. Verificación rápida

Después de configurar todo, prueba:

1. Anota tu propio email como Tester (paso 7).
2. Acepta la invitación.
3. Abre `https://rentmies-ads-engine.vercel.app/signup` y haz clic en **"Continuar con Facebook"**.
4. Deberías ver el dialog de Meta con los permisos listados.
5. Después de autorizar, deberías volver a `/onboarding/select-page` (si tienes >1 página) o `/onboarding/payment` (si tienes 1).

Si el dialog dice "App not active" → la app está en Dev Mode y tu cuenta no está en Testers.
Si dice "Invalid redirect URI" → revisa el paso 4.
Si dice "config_id not found" → revisa que `META_LOGIN_CONFIG_ID` en Vercel coincida con el ID del paso 5.

---

## 10. Cuando termines

Compárteme:
1. El **Configuration ID** del paso 5 (lo necesito para validar la env var).
2. El **App ID** (debe estar ya en Vercel, pero confirmemos).
3. Los emails de los **primeros 5-10 Testers** (los agentes piloto).
4. Confirmación que las URLs `/privacy`, `/terms`, `/data-deletion` están live en `rentmies.com`.

Yo me encargo del resto (código).

# Cómo conectar tu Meta Business a Rentmies

> Guía para administradores de inmobiliarias. Tiempo estimado: **10 minutos**.

Esta es la forma más rápida y segura de conectar tu Facebook Page e
Instagram Business a Rentmies. **No usa OAuth, no requiere App Review**, y el
token que generas **es permanente** — no caduca a menos que tú lo elimines.

---

## ¿Qué es un System User?

Un **System User** es un usuario de servidor que vive dentro de tu Business
Manager. No es una persona, es una "cuenta de máquina" que tú controlas.

Le asignas tu Página de Facebook y tu cuenta de Instagram como assets, le
generas un token, y le das ese token a Rentmies. Si algún día quieres
desconectarnos, simplemente eliminas el System User y el token deja de
funcionar al instante.

**Por qué es mejor que OAuth para tu caso:**

| | System User Token | OAuth |
|---|---|---|
| Caduca | ❌ Nunca (a menos que lo configures) | ✅ Cada 60 días |
| App Review de Meta | ❌ No requerido | ✅ Requerido para ir a producción pública |
| Sobrevive cambio de password | ✅ Sí | ❌ No |
| Permisos | Tú los controlas | El admin de la app los pide |
| Tiempo de setup | 10 min | 30 segundos |

---

## Pre-requisitos

Antes de empezar, asegúrate de tener:

- [ ] **Acceso de admin** a la cuenta de Business Manager de tu inmobiliaria
- [ ] Tu **Facebook Page** ya creada
- [ ] Tu **cuenta de Instagram convertida a Business** (gratis, 2 minutos en la app de IG)
- [ ] Tu Instagram **vinculada a tu Página de Facebook** (Meta Business Suite → Configuración → Cuentas vinculadas)

> ⚠️ Si tu Instagram es cuenta personal, conviértela primero a **Business** o
> **Creator** — sin esto, Rentmies no puede publicar.

---

## Paso 1 · Entra a Business Manager

Ve a **[business.facebook.com](https://business.facebook.com)** con la cuenta
admin de tu inmobiliaria.

Si te aparece "Crear cuenta de Business Manager", créala primero:
- Nombre: el de tu inmobiliaria (ej: *Inmobiliaria Cardona*)
- Tu nombre + correo

---

## Paso 2 · Abre Business Settings → System Users

Click en el ícono de **engranaje** (esquina inferior izquierda) o ve directo a
**[business.facebook.com/settings](https://business.facebook.com/settings)**.

En el menú izquierdo busca la sección **Users → System Users**.

> Si no ves "System Users", asegúrate de estar en una cuenta de **Business
> Manager** (no en tu perfil personal de Facebook).

---

## Paso 3 · Crea el System User

1. Click **Add** → te pide nombre y rol
2. **Nombre**: `Rentmies Connection`
3. **Rol**: `Admin` (necesitamos Admin para postear)
4. **Create System User**
5. Te pide tu password de Facebook para confirmar — pégalo

Verás el System User recién creado en la lista.

---

## Paso 4 · Asigna tu Página y tu Instagram

Con el System User seleccionado:

1. Click el botón **Add Assets** (parte derecha)
2. En la pestaña **Pages**:
   - Selecciona tu Facebook Page de la inmobiliaria
   - Activa **Manage Page** (es el toggle que da permiso completo)
   - Click **Save Changes**
3. Click **Add Assets** otra vez → pestaña **Instagram Accounts**:
   - Selecciona tu cuenta de IG Business
   - Activa **Manage Account**
   - Save Changes
4. (Opcional) Si tienes WhatsApp Business API:
   - Add Assets → **WhatsApp Accounts** → tu WABA → **Manage** → Save

---

## Paso 5 · Genera el token

Con el System User seleccionado, click **Generate New Token** (botón azul
arriba a la derecha).

1. **App**: selecciona **`Rentmies`** (si no aparece, contáctanos —
   necesitamos darte permiso a la app primero)
2. **Token expiration**: déjalo en **Never** (es lo importante — esto hace
   que el token no caduque)
3. **Permissions**: marca estos (busca con el filtro):
   - ✅ `pages_manage_posts`
   - ✅ `pages_read_engagement`
   - ✅ `pages_show_list`
   - ✅ `instagram_basic`
   - ✅ `instagram_content_publish`
   - ✅ `business_management`
   - (Si configuraste WhatsApp en paso 4) ✅ `whatsapp_business_management`, `whatsapp_business_messaging`
4. Click **Generate Token**
5. **⚠️ Copia el token AHORA** — solo se muestra una vez. Es un string largo
   tipo `EAAxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`. Guárdalo temporalmente en un
   bloc de notas seguro mientras lo pegas en Rentmies.

> Si pierdes el token, simplemente click **Generate New Token** otra vez —
> se invalida el anterior y te da uno nuevo.

---

## Paso 6 · Encuentra tu Page ID

Necesitas el ID numérico de tu Página (no el nombre).

**Opción A — desde la URL**: si la URL de tu página es
`facebook.com/InmobiliariaCardona-1234567890`, el ID es `1234567890`.

**Opción B — desde Meta Business Suite**:
1. Ve a [business.facebook.com](https://business.facebook.com)
2. Selecciona tu Página
3. Click **About** o **Información**
4. Busca el campo **Page ID** (al fondo)

**Opción C — desde la página directa**:
1. Abre tu página de Facebook
2. Click **About** / **Información**
3. Scroll hasta abajo — verás `Page ID: 123456789012345`

---

## Paso 7 · Pégalo en Rentmies

1. Entra a [rentmies-ads-engine.vercel.app/dashboard#settings](https://rentmies-ads-engine.vercel.app/dashboard#settings)
2. En la card **Meta · Facebook & Instagram**:
   - **System User Access Token**: pega el token del paso 5
   - **Facebook Page ID**: pega el ID del paso 6
   - **Instagram Business ID**: déjalo vacío — lo detectamos solo
   - **WABA ID**: solo si configuraste WhatsApp
3. Click **GUARDAR Y PROBAR**

En 5 segundos verás algo así:

```
✅ Conectado a "Inmobiliaria Cardona"
📘 Facebook Page · 4,200 seguidores
📷 @inmobiliariacardona · 12,400 seguidores
🔑 Token permanente · No caduca
```

¡Listo! Ya puedes ir a **Quick Post** y publicar tu primer post.

---

## Errores comunes

### "El token no es válido"
- Verifica que copiaste el token completo (es largo, ~200 caracteres)
- Verifica que generaste el token con la app **Rentmies** (no otra)
- Si dice `[190]`: el token expiró o lo regeneraron — vuelve a paso 5

### "No tienes acceso a la página XXX"
- Confirma que en paso 4 asignaste la Página al System User con
  **Manage Page** activo (no solo Analyze)
- Confirma que el Page ID que pegaste es el correcto

### "Instagram no detectado"
- Verifica que tu IG está convertida a **Business** (no Personal/Creator)
- Verifica que está vinculada a tu Page (Meta Business Suite → Linked Accounts)
- Si todo está bien y aún falla, copia manualmente el IG Business Account ID
  desde Meta Business Suite → Instagram → Settings → tu IG → Account ID

### "Faltan permisos" / código `[200]`
- Vuelve a paso 5 y regenera el token marcando **todos** los permisos de la
  lista. Es común olvidar `instagram_content_publish`.

### "La app Rentmies no está instalada"
- Esto significa que tu Business Manager no tiene la app Rentmies disponible.
  Contáctanos a `camilo@rentmies.com` con el ID de tu Business Manager y te
  agregamos al instante.

---

## Seguridad

- **Tu token nunca sale de tu Business Manager** — solo Rentmies (con tu
  permiso) puede usarlo.
- Lo guardamos cifrado en nuestra base de datos.
- Solo tiene acceso a los **assets que tú asignaste** en paso 4 — si
  asignaste 1 página, no puede tocar tus otras 5 páginas.
- Para revocar: ve a Business Settings → System Users → Rentmies Connection →
  **Delete**. El token muere instantáneamente y nuestros endpoints empiezan
  a fallar — Rentmies te muestra un banner para que generes uno nuevo si
  cambias de opinión.

---

## ¿Te trabaste?

Agenda 15 minutos con nuestro equipo y te conectamos juntos:
**[calendly.com/rentmies/onboarding](https://calendly.com/rentmies/onboarding)**

O escríbenos a **camilo@rentmies.com**.

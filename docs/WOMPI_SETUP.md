# Wompi — Guía de Setup

Pagos en Rentmies vía Wompi (Bancolombia). Este doc cubre cómo dejarlo funcionando en **sandbox** primero y luego promover a **producción**.

---

## 1. Dashboard de Wompi

1. Crear cuenta de comercio en https://comercios.wompi.co
2. Entrar a **Development → Developers**
3. Copiar las 4 llaves del entorno **Sandbox** (test):
   - `pub_test_…`        → public key (frontend)
   - `prv_test_…`        → private key (backend, NUNCA exponer)
   - `test_events_…`     → events secret (verificar webhooks)
   - `test_integrity_…`  → integrity secret (firmar widget txns)

> Las mismas 4 llaves existen para **producción** con prefijos `pub_prod_`, `prv_prod_`, `prod_events_`, `prod_integrity_`. Nunca mezclar entornos.

---

## 2. Variables en Vercel

Project: **rentmies-ads-engine** (`vercel env add`)

```
WOMPI_ENV=sandbox
WOMPI_PUBLIC_KEY=pub_test_xxx
WOMPI_PRIVATE_KEY=prv_test_xxx
WOMPI_EVENTS_SECRET=test_events_xxx
WOMPI_INTEGRITY_SECRET=test_integrity_xxx
```

Para los 5: agregar a los 3 environments (`Production`, `Preview`, `Development`) — todos apuntan a sandbox por ahora.

Cuando estemos listos para cobros reales, crear un set adicional con los `*_prod_*` y cambiar `WOMPI_ENV=production` solo en el environment **Production** del proyecto.

---

## 3. Schema en Supabase

Correr el archivo en **Supabase → SQL Editor**:

```
supabase/schema-wompi.sql
```

Crea: `subscriptions`, `wompi_transactions`, `usage_counters`, vista `subscriptions_due_for_renewal`.

Es idempotente — se puede correr varias veces.

---

## 4. Webhook URL en Wompi

En el dashboard Wompi → **Development → Developers → Events URL**, registrar **una vez por entorno**:

- Sandbox events URL: `https://rentmies-ads-engine.vercel.app/api/wompi/webhook`
- Production events URL: misma URL (Vercel sirve ambos entornos en el mismo dominio; lo que cambia es el `WOMPI_ENV` server-side)

Wompi envía eventos `transaction.updated` y `payment_source.created` a esa URL. El endpoint verifica la firma con `WOMPI_EVENTS_SECRET` antes de procesar.

---

## 5. Probar el flujo en sandbox

1. Ir a `/onboarding/payment` en producción (con sandbox keys puestas).
2. Seleccionar plan, llenar email + tarjeta.
3. Tarjetas de prueba (cualquier expiry futuro + cualquier CVC):
   - `4242 4242 4242 4242` → APPROVED
   - `4111 1111 1111 1111` → DECLINED
   - cualquier otro número → ERROR
4. Verificar que:
   - El backend respondió `status: APPROVED`
   - Llegó el webhook (revisar logs de `/api/wompi/webhook`)
   - En Supabase, la fila en `subscriptions` quedó `status='active'` con `current_period_end` a un mes
   - En `wompi_transactions` la fila pasó de `PENDING` a `APPROVED`

---

## 6. Pagos recurrentes (3RI)

El cron `/api/cron-renew-subscriptions` corre todos los días a las **4:00 UTC** y carga el plan de cada empresa contra su `payment_source_id` cuando `current_period_end` está a menos de 24h.

- En **sandbox**, esto funciona sin pasos extra.
- En **producción**, Wompi requiere activar **3DS para Payment Sources** desde su soporte (ticket o email) para que las tarjetas Mastercard puedan cargarse vía 3RI sin user-present. Visa funciona sin esto en muchos bancos pero algunos lo exigen. Pedir activación apenas se promueva a prod.

---

## 7. Endpoints expuestos

| Endpoint | Descripción |
|---|---|
| `GET  /api/wompi/plans` | Catálogo público (planes + public_key) |
| `GET  /api/wompi/acceptance-tokens` | Tokens T&C + Habeas Data frescos |
| `POST /api/wompi/checkout` | Tokenizar tarjeta + crear payment_source + primer cobro |
| `POST /api/wompi/webhook` | Recibe eventos firmados de Wompi |
| `GET  /api/wompi/subscription` | Estado actual del usuario (Bearer token) |
| `POST /api/wompi/subscription` `{ action: 'cancel' }` | Cancela al final del periodo |
| `GET  /api/cron-renew-subscriptions` | Vercel cron diario (3RI) |

---

## 8. Catálogo de planes

Definidos en `lib/wompi-plans.js`. Si cambian precios o cuotas se edita ese archivo (single source of truth). Hoy:

| Plan | USD/mes | COP/mes | Posts | Imágenes IA | Videos |
|---|---|---|---|---|---|
| Starter | $20 | $80.000 | 7 | 4 | 3 |
| Growth (recomendado) | $100 | $400.000 | 20 | 10 | 10 |
| Scale | $500 | $2.000.000 | 40 | 15 | 25 |

Conversión a 4.000 COP/USD redondeado. Re-evaluar trimestralmente.

---

## 9. Pre-launch checklist (al pasar a producción)

- [ ] Sandbox testing completo: APPROVED, DECLINED, ERROR + webhook recibido
- [ ] Activación 3DS for Payment Sources solicitada a Wompi support
- [ ] Llaves `pub_prod_` / `prv_prod_` / `prod_events_` / `prod_integrity_` en Vercel
- [ ] `WOMPI_ENV=production` solo en environment Production
- [ ] Webhook URL de producción registrada en Wompi dashboard
- [ ] Cron `cron-renew-subscriptions` activo en `vercel.json`
- [ ] Páginas legales en rentmies.com (privacy, terms, cancelación, refund policy)
- [ ] Probado el flujo de cancelación desde el dashboard

---

## 10. Troubleshooting rápido

- **`Wompi not configured` en /api/wompi/***: faltan env vars. Revisar `vercel env ls`.
- **`Invalid signature` en webhook**: el `WOMPI_EVENTS_SECRET` no coincide con el del entorno (sandbox vs prod) registrado en el dashboard.
- **`Tarjeta rechazada` en sandbox**: verificar que se está usando `4242 4242 4242 4242`. Otras numeraciones son DECLINED por diseño.
- **`payment_source.status === 'PENDING'` infinitamente**: pasa con tarjetas Mastercard sin 3DS activado en cuentas de producción. Solicitar activación a Wompi.

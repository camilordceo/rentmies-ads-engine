/* ─────────────────────────────────────────────────────────────
   WhatsApp Template Presets — librería para inmobiliarias (Step 15)
   6 templates pre-armados que el editor puede cargar con un click.
   Tono: directo, sin promociones agresivas, alineado con políticas
   de Meta (UTILITY > MARKETING para acciones operativas).

   Each preset is the canonical state shape consumed by the editor:
     { name, category, language, header, body, footer, buttons,
       examples }
   ───────────────────────────────────────────────────────────── */

(function () {
  'use strict'

  const PRESETS = [
    {
      key: 'visit_confirmation',
      title: 'Confirmación de visita',
      category_label: 'UTILITY · transaccional',
      preview: 'Hola {{1}}, confirmamos tu visita al inmueble {{2}} el {{3}} a las {{4}}.',
      template: {
        name: 'confirmacion_visita_inmueble',
        category: 'UTILITY',
        language: 'es_CO',
        header: { type: 'TEXT', text: 'Visita confirmada · {{1}}', examples: { '1': 'Castelo Medellín' } },
        body: 'Hola {{1}}, confirmamos tu visita al inmueble {{2}} el {{3}} a las {{4}}. Te esperamos. Si necesitas reagendar, responde este mensaje.',
        footer: 'Equipo Rentmies',
        buttons: [
          { type: 'QUICK_REPLY', text: 'Confirmo asistencia' },
          { type: 'QUICK_REPLY', text: 'Necesito reagendar' }
        ],
        examples: { '1': 'Carolina', '2': 'Penthouse Calle 93', '3': 'sábado 14 de junio', '4': '10:00 am' }
      }
    },
    {
      key: 'visit_reminder',
      title: 'Recordatorio 1h antes',
      category_label: 'UTILITY · transaccional',
      preview: '{{1}}, te recordamos tu visita en {{2}} en 1 hora.',
      template: {
        name: 'recordatorio_visita_1h',
        category: 'UTILITY',
        language: 'es_CO',
        header: { type: 'NONE' },
        body: '{{1}}, te recordamos tu visita en {{2}} en 1 hora. Dirección: {{3}}. ¿Necesitas indicaciones?',
        footer: '',
        buttons: [
          { type: 'QUICK_REPLY', text: 'Voy en camino' },
          { type: 'QUICK_REPLY', text: 'Mándame ubicación' }
        ],
        examples: { '1': 'Carolina', '2': 'Penthouse Calle 93', '3': 'Cra 12 # 93-15, Bogotá' }
      }
    },
    {
      key: 'new_property',
      title: 'Nueva propiedad disponible',
      category_label: 'MARKETING · promocional',
      preview: '{{1}}, llegó un inmueble que cumple tus criterios — {{2}}, {{3}}, {{4}}.',
      template: {
        name: 'nueva_propiedad_disponible',
        category: 'MARKETING',
        language: 'es_CO',
        header: { type: 'IMAGE', media_url: '', media_kind: 'image' },
        body: '{{1}}, llegó un inmueble que cumple tus criterios: {{2}}, {{3}} habitaciones, {{4}}. Avísanos si quieres agendar visita.',
        footer: 'Si ya no buscas inmueble, responde DAR DE BAJA',
        buttons: [
          { type: 'URL', text: 'Ver detalles', url: 'https://rentmies.com/p/{{1}}', example: 'castelo-pollado' },
          { type: 'QUICK_REPLY', text: 'Agendar visita' }
        ],
        examples: { '1': 'Carolina', '2': 'Castelo Medellín', '3': '3', '4': 'parqueadero doble' }
      }
    },
    {
      key: 'payment_reminder',
      title: 'Recordatorio de pago',
      category_label: 'UTILITY · transaccional',
      preview: 'Hola {{1}}, tu pago de {{2}} vence el {{3}}.',
      template: {
        name: 'recordatorio_pago_arriendo',
        category: 'UTILITY',
        language: 'es_CO',
        header: { type: 'NONE' },
        body: 'Hola {{1}}, tu pago de {{2}} vence el {{3}}. Si ya pagaste, ignora este mensaje. Si necesitas alargar el plazo, escríbenos.',
        footer: 'Equipo Rentmies',
        buttons: [
          { type: 'URL', text: 'Pagar ahora', url: 'https://rentmies.com/pay/{{1}}', example: 'inv_2026_05_01' },
          { type: 'QUICK_REPLY', text: 'Ya pagué' }
        ],
        examples: { '1': 'Carolina', '2': '$2,800,000 COP', '3': '5 de junio' }
      }
    },
    {
      key: 'tenant_welcome',
      title: 'Bienvenida nuevo inquilino',
      category_label: 'UTILITY · onboarding',
      preview: '¡Bienvenido {{1}} a tu nuevo hogar en {{2}}!',
      template: {
        name: 'bienvenida_inquilino',
        category: 'UTILITY',
        language: 'es_CO',
        header: { type: 'TEXT', text: 'Bienvenido a Rentmies' },
        body: '¡Bienvenido {{1}} a tu nuevo hogar en {{2}}! Tu pago automático ya está configurado. Si tienes cualquier inconveniente con el inmueble, este chat es tu canal directo con nuestro equipo de soporte.',
        footer: 'Equipo Rentmies',
        buttons: [
          { type: 'QUICK_REPLY', text: 'Reportar incidente' },
          { type: 'QUICK_REPLY', text: 'Solicitar mantenimiento' },
          { type: 'URL', text: 'Mi cuenta', url: 'https://rentmies.com/cuenta' }
        ],
        examples: { '1': 'Carolina', '2': 'Penthouse Calle 93' }
      }
    },
    {
      key: 'lease_renewal',
      title: 'Renovación de contrato',
      category_label: 'UTILITY · transaccional',
      preview: '{{1}}, tu contrato en {{2}} vence el {{3}}.',
      template: {
        name: 'renovacion_contrato',
        category: 'UTILITY',
        language: 'es_CO',
        header: { type: 'NONE' },
        body: '{{1}}, tu contrato en {{2}} vence el {{3}}. ¿Quieres renovar? Tenemos tu propuesta lista. Responde este mensaje y te la enviamos en 24 horas.',
        footer: 'Equipo Rentmies',
        buttons: [
          { type: 'QUICK_REPLY', text: 'Quiero renovar' },
          { type: 'QUICK_REPLY', text: 'No renovar' },
          { type: 'QUICK_REPLY', text: 'Necesito hablar' }
        ],
        examples: { '1': 'Carolina', '2': 'Penthouse Calle 93', '3': '15 de octubre' }
      }
    }
  ]

  window.rmTplPresets = { PRESETS }
})()

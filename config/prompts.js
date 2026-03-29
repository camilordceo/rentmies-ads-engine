/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║           RENTMIES ADS ENGINE — PROMPTS EDITABLES           ║
 * ╚══════════════════════════════════════════════════════════════╝
 *
 * Este archivo contiene TODOS los prompts del sistema.
 * Edítalos directamente aquí o desde el dashboard (⚙️ Editar Prompts).
 *
 * CÓMO EDITAR:
 *   1. Cambia el texto entre las comillas backtick (`...`)
 *   2. El servidor recarga automáticamente si usas `npm run dev`
 *   3. Los cambios aplican al siguiente batch de generación
 */

const PROMPTS = {

  // ─────────────────────────────────────────────────────────────
  // COPY DE ADS
  // Estos prompts controlan el texto que genera Gemini para cada ad.
  // El prompt `system` define la personalidad del copywriter IA.
  // Cada `variation` es un ángulo de marketing diferente.
  // ─────────────────────────────────────────────────────────────
  adCopy: {
    /**
     * SYSTEM PROMPT — La voz del copywriter
     * Edita esto para cambiar el tono general de todos los ads.
     * Tip: menciona la ciudad objetivo para copy más local.
     */
    system: `Eres un experto en marketing inmobiliario colombiano.
    Escribes copy persuasivo, directo y con urgencia real.
    Usas lenguaje colombiano natural (colombianismos sutiles), nunca corporativo.
    Conoces el mercado de Bogotá, Medellín y Cali perfectamente.
    NUNCA uses frases cliché como "el hogar de sus sueños".
    Siempre incluye un CTA claro y accionable.`,

    /**
     * VARIACIONES DE COPY
     * Cada variación es un ángulo psicológico diferente.
     * Genera A/B testing automático entre ellas.
     */
    variations: {
      /**
       * painPoint — Apela al dolor y la frustración
       * Mejor para: audiencias que ya han intentado buscar inmueble
       * CTR esperado: alto en frío
       */
      painPoint: `Genera un ad de Facebook/Instagram enfocado en el DOLOR del arrendatario colombiano:
        - Buscar inmueble consume semanas sin respuesta
        - Las inmobiliarias tradicionales no contestan rápido
        - Pierden tiempo en visitas que no sirven
        Solución clara: Rentmies responde en segundos por WhatsApp 24/7.

        Contexto: {{ciudad}}, {{tipoInmueble}}, presupuesto {{presupuesto}} COP.

        FORMATO DE RESPUESTA (JSON):
        {
          "headline": "máximo 40 caracteres, impactante",
          "description": "125 caracteres explicando la solución",
          "cta": "20 caracteres, accionable",
          "hook": "primera frase que detiene el scroll"
        }`,

      /**
       * outcome — Apela al resultado deseado
       * Mejor para: audiencias que saben lo que quieren
       * CTR esperado: alto en retargeting
       */
      outcome: `Genera un ad enfocado en el RESULTADO POSITIVO:
        - Encontrar el inmueble perfecto rápido
        - Sin llamadas que no contestan
        - Sin intermediarios que complican
        - Solo WhatsApp, simple y directo

        Contexto: {{ciudad}}, {{tipoInmueble}}, presupuesto {{presupuesto}} COP.

        FORMATO DE RESPUESTA (JSON):
        {
          "headline": "máximo 40 caracteres, aspiracional",
          "description": "125 caracteres sobre el resultado",
          "cta": "20 caracteres",
          "hook": "primera frase que detiene el scroll"
        }`,

      /**
       * social — Prueba social y credibilidad
       * Mejor para: audiencias que dudan de soluciones nuevas
       * CTR esperado: alto en audiencias tibias
       */
      social: `Genera un ad con PRUEBA SOCIAL y credibilidad:
        - Primera inmobiliaria en Colombia con IA real
        - Ya cerró arriendos y ventas reales en {{ciudad}}
        - Clientes reales que encontraron inmueble en horas
        - Tecnología que funciona de verdad

        Contexto: {{ciudad}}, {{tipoInmueble}}, presupuesto {{presupuesto}} COP.

        FORMATO DE RESPUESTA (JSON):
        {
          "headline": "máximo 40 caracteres con credibilidad",
          "description": "125 caracteres con prueba social",
          "cta": "20 caracteres",
          "hook": "primera frase que detiene el scroll"
        }`,

      /**
       * urgency — Urgencia y escasez
       * Mejor para: remarketing de usuarios activos
       * CTR esperado: muy alto, usar con moderación
       */
      urgency: `Genera un ad con URGENCIA REAL (no falsa):
        - Los buenos inmuebles en {{ciudad}} duran días, no semanas
        - Quienes buscan primero, arriendan primero
        - El mercado en {{ciudad}} está activo ahora mismo
        - Rentmies te avisa antes que nadie

        Contexto: {{ciudad}}, {{tipoInmueble}}, presupuesto {{presupuesto}} COP.

        FORMATO DE RESPUESTA (JSON):
        {
          "headline": "máximo 40 caracteres con urgencia",
          "description": "125 caracteres con escasez real",
          "cta": "20 caracteres urgente",
          "hook": "primera frase que detiene el scroll"
        }`
    },

    /**
     * LÍMITES DE CARACTERES POR PLATAFORMA
     * Referencia técnica para el formatter.
     * No editar a menos que Meta/TikTok cambien sus specs.
     */
    formats: {
      facebook:  { headline: 40, description: 125, cta: 20 },
      instagram: { headline: 30, caption: 150, hashtags: 10 },
      whatsapp:  { message: 200 },
      tiktok:    { hook: 5, script: 60 }
    }
  },

  // ─────────────────────────────────────────────────────────────
  // PROMPTS DE IMÁGENES
  // Controlan qué genera Imagen 3 (Google).
  // REGLA IMPORTANTE: NUNCA pedir texto dentro de la imagen.
  // El overlay (headline, logo, CTA) se agrega programáticamente.
  // ─────────────────────────────────────────────────────────────
  imagePrompts: {
    /**
     * ESTILO GLOBAL — Aplica a todas las imágenes
     * Edita para cambiar la estética general de los creativos.
     */
    style: `Fotografía arquitectónica profesional de alta calidad.
    Colores cálidos y luminosos, luz natural abundante.
    Estilo moderno colombiano, no europeo ni americano.
    Ambiente aspiracional pero alcanzable, no lujoso extremo.
    REGLAS ESTRICTAS:
    - NUNCA texto dentro de la imagen
    - NUNCA logos ni marcas visibles
    - NUNCA personas en la imagen (solo espacios)
    - Calidad editorial premium, no foto de stock genérica
    - Resolución ultra alta, detalles nítidos`,

    /**
     * ESCENAS — Una por tipo de inmueble
     * Agrega más escenas según los tipos de inmueble que manejes.
     */
    scenes: {
      /**
       * Apartamento — La escena más común
       */
      apartment: `Apartamento moderno en Colombia, interior luminoso.
        Sala de estar amplia con ventanales grandes de piso a techo.
        Vista a ciudad colombiana moderna al fondo (skyline urbano).
        Decoración contemporánea minimalista, tonos neutros y cálidos.
        Luz natural de tarde, atmósfera acogedora y aspiracional.
        Acabados modernos: pisos en madera clara o porcelanato, cocina integrada.`,

      /**
       * Casa — Mercado familiar y suburbano
       */
      house: `Casa con jardín en barrio residencial colombiano premium.
        Fachada moderna con elementos en ladrillo o concreto visto.
        Jardín bien cuidado, árboles y luz de tarde cálida dorada.
        Ambiente familiar, seguro, tranquilo.
        Zona residencial de clase media-alta colombiana.
        Garaje visible, detalles arquitectónicos contemporáneos.`,

      /**
       * Exterior de edificio — Para ads de proyecto o barrio
       */
      exterior: `Vista exterior de edificio residencial moderno.
        Arquitectura contemporánea colombiana, 8-15 pisos.
        Cielo azul despejado, luz de mediodía brillante.
        Zona residencial premium de Bogotá, Medellín o Cali.
        Áreas verdes alrededor, vías bien mantenidas.
        Fachada con vidrios y materiales modernos.`,

      /**
       * Oficina — Para inmuebles comerciales
       */
      office: `Oficina moderna en Colombia, espacio corporativo premium.
        Open space con luz natural, plantas decorativas.
        Muebles modernos, ambiente productivo y profesional.
        Vista a ciudad colombiana desde ventanales.
        Zona empresarial de Bogotá (Chicó, Usaquén) o Medellín (El Poblado).`
    },

    /**
     * OVERLAY — Texto que se agrega SOBRE la imagen
     * Esto NO lo hace Imagen 3, lo hace imageGen.js con Jimp.
     * Edita el style para cambiar cómo se ve el overlay.
     */
    overlay: {
      headline: true,   // Muestra el headline del ad
      logo: true,        // Muestra logo de Rentmies
      cta: true,         // Muestra botón CTA
      style: `Texto blanco bold, fondo semitransparente verde #1D9E75 (80% opacidad).
              Posición: franja inferior de la imagen (20% altura).
              Logo: esquina superior izquierda, pequeño y discreto.
              Fuente: moderna sans-serif, nunca serif.
              Padding generoso, diseño limpio y legible.`
    }
  },

  // ─────────────────────────────────────────────────────────────
  // PROMPTS DE ANÁLISIS
  // Gemini usa estos para evaluar performance y tomar decisiones.
  // Los umbrales aquí deben coincidir con los de analyzer.js.
  // ─────────────────────────────────────────────────────────────
  analysisPrompts: {
    /**
     * EVALUACIÓN DE AD
     * Gemini recibe las métricas reales y decide qué hacer.
     * Edita los umbrales aquí Y en engine/analyzer.js para mantener sincronía.
     */
    evaluate: `Eres el analista de performance de Rentmies, startup inmobiliaria en Colombia.

    Analiza estas métricas de un ad activo y toma una decisión:

    MÉTRICAS DEL AD:
    {{metrics}}

    UMBRALES DE DECISIÓN:
    - PAUSAR si: CTR < 0.8% después de 100+ impresiones
    - PAUSAR si: CPC > $5000 COP con CTR < 1.5%
    - MANTENER si: CTR entre 0.8% y 3%, CPC razonable
    - ESCALAR si: CTR > 3% Y CPC < $2000 COP
    - ESCALAR AGRESIVO si: CTR > 5% Y CPC < $1500 COP

    CONTEXTO:
    - Mercado: inmobiliario colombiano
    - Objetivo: leads de WhatsApp (personas que inician chat)
    - Presupuesto disponible para escalar: hasta 3x presupuesto actual

    RESPONDE SOLO EN JSON, sin texto adicional:
    {
      "decision": "pausar | mantener | escalar | escalar_agresivo",
      "razon": "explicación breve en español (máx 100 chars)",
      "nuevo_presupuesto": número en COP (null si mantener/pausar),
      "confianza": número del 1 al 10,
      "metricas_clave": ["lista de métricas que determinaron la decisión"]
    }`,

    /**
     * RECOMENDACIÓN DE CAMPAÑA
     * Para cuando el usuario pide sugerencias de qué generar.
     */
    recommend: `Basándote en el historial de performance de Rentmies en {{ciudad}},
    recomienda la mejor estrategia para la próxima campaña.

    HISTORIAL:
    {{history}}

    RESPONDE EN JSON:
    {
      "variacion_recomendada": "painPoint | outcome | social | urgency",
      "plataforma_recomendada": "facebook | instagram | tiktok",
      "presupuesto_sugerido": número en COP,
      "razon": "explicación breve",
      "horario_optimo": "HH:MM - HH:MM"
    }`
  }
}

module.exports = { PROMPTS }

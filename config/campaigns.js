/**
 * RENTMIES ADS ENGINE — CONFIGURACIÓN DE CAMPAÑAS
 * Define las plantillas y configuración por defecto para campañas.
 */

const CAMPAIGN_TEMPLATES = {
  arrendamiento: {
    name: 'Arrendamiento',
    icon: '🏠',
    defaultBudget: 150000, // COP por día
    targetAudience: {
      ageRange: [22, 45],
      interests: ['inmuebles', 'mudanza', 'apartamentos', 'bienes raíces'],
      behaviors: ['likely_to_move'],
    },
    placements: ['feed', 'stories', 'reels'],
    budgetSplit: {
      facebook: 0.5,
      instagram: 0.4,
      tiktok: 0.1
    }
  },

  venta: {
    name: 'Venta',
    icon: '🏢',
    defaultBudget: 300000,
    targetAudience: {
      ageRange: [28, 55],
      interests: ['inversión', 'finca raíz', 'vivienda', 'crédito hipotecario'],
      behaviors: ['home_buyers'],
    },
    placements: ['feed', 'stories'],
    budgetSplit: {
      facebook: 0.6,
      instagram: 0.4,
      tiktok: 0
    }
  },

  remarketing: {
    name: 'Remarketing',
    icon: '🎯',
    defaultBudget: 80000,
    targetAudience: {
      type: 'custom_audience',
      source: 'website_visitors_30d',
    },
    placements: ['feed', 'stories'],
    budgetSplit: {
      facebook: 0.7,
      instagram: 0.3,
      tiktok: 0
    }
  }
}

const CIUDADES = {
  bogota: {
    name: 'Bogotá',
    zonas: ['Chapinero', 'Usaquén', 'Suba', 'Kennedy', 'Fontibón', 'El Chicó', 'Teusaquillo'],
    presupuestoMin: 800000,
    presupuestoMax: 5000000,
    codigoGeo: 'CO-BOG'
  },
  medellin: {
    name: 'Medellín',
    zonas: ['El Poblado', 'Laureles', 'Envigado', 'Bello', 'Sabaneta', 'La Estrella'],
    presupuestoMin: 700000,
    presupuestoMax: 4000000,
    codigoGeo: 'CO-MED'
  },
  cali: {
    name: 'Cali',
    zonas: ['Ciudad Jardín', 'El Peñón', 'Granada', 'Chipichape', 'San Fernando'],
    presupuestoMin: 600000,
    presupuestoMax: 3000000,
    codigoGeo: 'CO-CAL'
  }
}

const TIPOS_INMUEBLE = ['apartamento', 'casa', 'oficina', 'local', 'bodega', 'apartaestudio']

module.exports = { CAMPAIGN_TEMPLATES, CIUDADES, TIPOS_INMUEBLE }

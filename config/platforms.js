/**
 * RENTMIES ADS ENGINE — CONFIGURACIÓN DE PLATAFORMAS
 * Define specs técnicas y configuración de cada canal publicitario.
 */

const PLATFORMS = {
  meta_feed: {
    id: 'meta_feed',
    name: 'Meta Feed',
    icon: '📘',
    network: 'meta',
    placement: 'feed',
    specs: {
      imageSize: { width: 1080, height: 1080 },
      aspectRatio: '1:1',
      maxFileSize: '30MB',
      formats: ['jpg', 'png', 'mp4'],
      headlineMax: 40,
      descriptionMax: 125,
      ctaMax: 20
    },
    cpm_estimate: 8000, // COP estimado
    enabled: true
  },

  meta_stories: {
    id: 'meta_stories',
    name: 'Meta Stories',
    icon: '📱',
    network: 'meta',
    placement: 'stories',
    specs: {
      imageSize: { width: 1080, height: 1920 },
      aspectRatio: '9:16',
      maxFileSize: '30MB',
      formats: ['jpg', 'png', 'mp4'],
      headlineMax: 30,
      descriptionMax: 100,
      ctaMax: 20
    },
    cpm_estimate: 6000,
    enabled: true
  },

  instagram_feed: {
    id: 'instagram_feed',
    name: 'Instagram Feed',
    icon: '📸',
    network: 'meta',
    placement: 'instagram_feed',
    specs: {
      imageSize: { width: 1080, height: 1080 },
      aspectRatio: '1:1',
      maxFileSize: '30MB',
      formats: ['jpg', 'png', 'mp4'],
      headlineMax: 30,
      captionMax: 150,
      hashtagsMax: 10
    },
    cpm_estimate: 9000,
    enabled: true
  },

  tiktok: {
    id: 'tiktok',
    name: 'TikTok Ads',
    icon: '🎵',
    network: 'tiktok',
    placement: 'in_feed',
    specs: {
      imageSize: { width: 1080, height: 1920 },
      aspectRatio: '9:16',
      maxFileSize: '500MB',
      formats: ['mp4', 'mov'],
      hookMax: 5,   // segundos
      scriptMax: 60 // segundos
    },
    cpm_estimate: 5000,
    enabled: false // Requiere cuenta TikTok Ads separada
  }
}

const META_API = {
  version: 'v21.0',
  baseUrl: 'https://graph.facebook.com',
  adObjective: 'LEAD_GENERATION',
  billingEvent: 'IMPRESSIONS',
  optimizationGoal: 'LEAD_GENERATION'
}

module.exports = { PLATFORMS, META_API }

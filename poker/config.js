// config.js - Dynamic Environment Configuration
const CONFIG = {
  // Automatically routes to localhost during local dev, or your live Render server in production
  SERVER_URL: (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
    ? 'http://localhost:3000'
    : 'https://pyropot-github-io.onrender.com',
  DEFAULT_THEME: 'classic-vegas',
  AUDIO_ENABLED_BY_DEFAULT: true
};
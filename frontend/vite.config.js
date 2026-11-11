import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), VitePWA({
    registerType: 'prompt',
    injectRegister: false,
    manifest: {
      name: 'VERA Digital Systems',
      short_name: 'VERA',
      description: 'Auditorías, riesgos, controles y evidencias.',
      start_url: '/',
      scope: '/',
      display: 'standalone',
      background_color: '#121a24',
      theme_color: '#121a24',
      icons: [
        { src: '/vera-logo.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
        { src: '/vera-logo.png', sizes: '1024x1024', type: 'image/png', purpose: 'any' }
      ]
    },
    workbox: {
      globPatterns: ['**/*.{js,css,html,svg,png}'],
      maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
      cleanupOutdatedCaches: true,
      navigateFallback: '/index.html',
      navigateFallbackDenylist: [/^\/api(?:\/|$)/]
    }
  })],
  server: {
    proxy: {
      '/api': 'http://localhost:3000',
    },
  },
})

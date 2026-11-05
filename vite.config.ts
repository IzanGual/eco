import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// En GitHub Pages la app vive en /eco/
const base = process.env.GITHUB_PAGES ? '/eco/' : '/';

export default defineConfig({
  base,
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      workbox: { globPatterns: ['**/*.{js,css,html,svg,png,woff2}'], maximumFileSizeToCacheInBytes: 3_000_000 },
      includeAssets: ['icon.svg', 'apple-touch-icon.png', 'logo-light.svg', 'logo-dark.svg'],
      manifest: {
        name: 'Eco — Gastos',
        short_name: 'Eco',
        description: 'Control de gastos personal, sin límites.',
        lang: 'es',
        start_url: base,
        scope: base,
        id: base,
        display: 'standalone',
        background_color: '#1b1a17',
        theme_color: '#f2eee6',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          { src: 'icon-mono-512.png', sizes: '512x512', type: 'image/png', purpose: 'monochrome' }
        ]
      }
    })
  ]
});

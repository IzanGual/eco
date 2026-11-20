import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// En GitHub Pages la app vive en /eco/
const base = process.env.GITHUB_PAGES ? '/eco/' : '/';

export default defineConfig({
  base,
  // Versión = fecha y hora de publicación (UTC): se ve en Ajustes y en «En pareja»
  define: { __APP_VERSION__: JSON.stringify(new Date().toISOString().slice(0, 16)) },
  plugins: [
    react(),
    // Las dos fuentes de la app se piden junto con el HTML, no cuando ya hay texto en pantalla (sin parpadeo de letra)
    {
      name: 'eco-preload-fonts',
      enforce: 'post',
      transformIndexHtml: {
        order: 'post',
        handler(_html, ctx) {
          if (!ctx.bundle) return [];
          return Object.keys(ctx.bundle)
            .filter((f) => /instrument-(sans-latin-wght|serif-latin-400)-normal-[\w-]+\.woff2$/.test(f))
            .map((f) => ({ tag: 'link', attrs: { rel: 'preload', as: 'font', type: 'font/woff2', href: base + f, crossorigin: '' }, injectTo: 'head' as const }));
        }
      }
    },
    VitePWA({
      registerType: 'prompt',
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        maximumFileSizeToCacheInBytes: 3_000_000,
        // Todo sale de la caché: abre sin conexión y sin esperar a la red
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true
      },
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

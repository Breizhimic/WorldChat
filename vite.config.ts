import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  if (env.VITE_SUPABASE_PUBLISHABLE_KEY && !env.VITE_SUPABASE_PUBLISHABLE_KEY.startsWith('sb_publishable_')) {
    throw new Error('Build refusé : VITE_SUPABASE_PUBLISHABLE_KEY doit être une clé publique sb_publishable_, jamais une clé secrète.');
  }
  return {
  base: '/WorldChat/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['icon.svg', 'apple-touch-icon.png'],
      manifest: {
        id: '/WorldChat/',
        name: 'WorldChat',
        short_name: 'WorldChat',
        description: 'Le début d’une conversation sans frontières.',
        lang: 'fr',
        start_url: '/WorldChat/',
        scope: '/WorldChat/',
        display: 'standalone',
        background_color: '#f5f6f2',
        theme_color: '#163e35',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icon-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico}'],
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        navigateFallback: 'index.html',
        navigateFallbackDenylist: [/\/assets\//],
        clientsClaim: true,
        runtimeCaching: [
          {
            urlPattern: ({ url, sameOrigin }) =>
              (sameOrigin && url.pathname.endsWith('.wasm')) ||
              (url.origin === 'https://cdn.jsdelivr.net' &&
                url.pathname.startsWith('/npm/onnxruntime-web@') &&
                url.pathname.includes('/dist/ort-wasm')),
            handler: 'CacheFirst',
            options: {
              cacheName: 'worldchat-translation-runtime-v1',
              expiration: { maxEntries: 6, maxAgeSeconds: 365 * 24 * 60 * 60 },
              cacheableResponse: { statuses: [200] },
            },
          },
        ],
      },
    }),
  ],
  worker: { format: 'es' },
  };
});

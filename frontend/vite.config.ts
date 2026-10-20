import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'FastParking',
        short_name: 'FastParking',
        description: 'Disponibilidad por zona y retención temporal simulada — prototipo académico',
        lang: 'es-CO',
        theme_color: '#083E4D',
        background_color: '#F3F7F8',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // RNF-10: la API nunca se sirve desde caché; solo el "app shell" funciona sin conexión.
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [{ urlPattern: /\/api\//, handler: 'NetworkOnly' }],
      },
    }),
  ],
  server: {
    port: 5173,
    host: true, // permite abrir la PWA desde el celular en la misma red Wi-Fi
    proxy: { '/api': { target: 'http://localhost:3000', changeOrigin: true } },
  },
});

// client/vite.config.js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // Usamos el sw.js que escribimos a mano (no generado automático)
      strategies: 'injectManifest',
      srcDir: 'public',
      filename: 'sw.js',
      
      // Si preferís el SW auto-generado por Workbox, cambiá a strategies: 'generateSW'
      // y comentá srcDir/filename
      
      registerType: 'prompt', // No auto-actualiza: muestra toast
      injectRegister: false,  // Lo registramos manualmente en usePWA.js
      
      manifest: false, // Usamos nuestro manifest.json en public/
      
      devOptions: {
        enabled: true, // Activa PWA en dev para testing
      },
    }),
  ],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
})

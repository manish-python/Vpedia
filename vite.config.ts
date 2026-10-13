import { fileURLToPath, URL } from 'node:url'

import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

/** Where the dev proxy forwards `/api` and `/admin` unless overridden. */
const BACKEND_ORIGIN = 'http://127.0.0.1:8000'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // `VITE_DEV_BACKEND` lets a developer move the Django server without editing
  // this file, which keeps the port out of the committed config. It is
  // build-time only and never reaches the browser bundle.
  const env = loadEnv(mode, process.cwd(), 'VITE_')
  const target = env.VITE_DEV_BACKEND || BACKEND_ORIGIN

  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    server: {
      host: '0.0.0.0',
      allowedHosts: [
  "https://drilling-woven-staging.ngrok-free.dev",
],
      // Same-origin proxy to the Django backend.
      //
      // This is what lets the HTTP-only session cookie work in development. The
      // browser sees every request as the Vite origin, so the cookie is a plain
      // first-party cookie and no cross-site cookie policy is involved. Without
      // the proxy the SPA and the API would be different origins and
      // `SameSite=Lax` would block the session on every call.
      proxy: {
        '/api': {
          target,
          changeOrigin: false,
          // The OAuth round trip is a full-page navigation, so the session
          // cookie must survive the redirect back from Google.
          cookieDomainRewrite: '',
        },
        // Keep `/admin-panel` in the SPA. A plain `/admin` proxy key also
        // matches that frontend prefix and incorrectly sends the React route
        // to Django, producing a backend 404. The trailing slash limits this
        // proxy to Django Admin paths.
        '/admin/': {
          target,
        },
        // Staff-guarded uploads (payment screenshots). Without this the dev
        // server answers `/private-media/...` with the SPA index.html, so an
        // admin reviewing a payment gets HTML where an image should be.
        // `changeOrigin: false` keeps the session cookie first-party, which is
        // exactly what the staff-only guard on the Django side checks.
        '/private-media/': {
          target,
          changeOrigin: false,
        },
      },
    },
    build: {
      // PDF.js is ~190 kB gzipped and is only fetched when a student opens the
      // document viewer, so the chunk-size warning is expected rather than a
      // problem to chase.
      chunkSizeWarningLimit: 700,
      rollupOptions: {
        output: {
          // Keep PDF.js out of the initial app bundle.
          manualChunks(id: string) {
            if (id.includes('node_modules/react-pdf') || id.includes('node_modules/pdfjs-dist')) {
              return 'pdf'
            }
            return undefined
          },
        },
      },
    },
  }
})

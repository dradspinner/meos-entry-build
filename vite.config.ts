import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import type { ServerResponse } from 'http'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react()
  ],
  server: {
    port: 5174,
    strictPort: false, // Try next available port if 5174 is busy
    proxy: {
      // Proxy MeOS API requests to bypass CORS
      '/meos': {
        target: 'http://localhost:2009',
        changeOrigin: true,
        secure: false,
        ws: false,
        configure: (proxy, _options) => {
          proxy.on('error', (err, _req, res) => {
            console.error('Proxy error:', err.message);
            const response = res as ServerResponse;
            if (response && typeof response.writeHead === 'function' && !response.headersSent) {
              response.writeHead(503, { 'Content-Type': 'application/json' });
              response.end(JSON.stringify({ error: 'MeOS service unavailable. Please ensure MeOS is running on port 2009.' }));
            }
          });
          proxy.on('proxyReq', (_proxyReq, req, _res) => {
            console.log('Proxying request:', req.method, req.url);
          });
        }
      }
    }
  }
})

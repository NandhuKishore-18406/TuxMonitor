import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:15000',
        changeOrigin: true
      },
      '/ws': {
        target: 'http://localhost:15000',
        ws: true,
        changeOrigin: true,
        configure: (proxy) => {
          proxy.on('error', (err) => {
            if (err.code === 'ECONNRESET' || err.code === 'EPIPE') {
              return; // Suppress client disconnect / reload noise
            }
            console.error('[vite] ws proxy error:', err.message);
          });
          proxy.on('proxyReqWs', (_proxyReq, _req, socket) => {
            socket.on('error', (err) => {
              if (err.code === 'ECONNRESET' || err.code === 'EPIPE') {
                return;
              }
              console.error('[vite] ws proxy socket error:', err.message);
            });
          });
        }
      }
    }
  }
})

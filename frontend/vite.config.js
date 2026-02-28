import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  server: {
    port: 5174,
    host: true,
    proxy: {
      '/auth': {
        target: 'http://localhost:4001',
        changeOrigin: true
      },
      '/api': {
        target: 'http://localhost:4001',
        changeOrigin: true
      },
      '/socket.io': {
        target: 'http://localhost:4001',
        changeOrigin: true,
        ws: true
      }
    }
  },
  build: {
    outDir: 'dist',
    sourcemap: false
  }
});

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss()
  ],
  server: {
    port: 3000,
    proxy: {
      '/api': 'http://localhost:4000',
      '/v1': 'http://localhost:4000',
      '/proxy': 'http://localhost:4000',
      '/health': 'http://localhost:4000'
    }
  }
});

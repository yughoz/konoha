import { defineConfig } from 'vite';

export default defineConfig({
  build: { rollupOptions: { input: { main: 'index.html', admin: 'admin.html' } } },
  server: { proxy: { '/api': 'http://127.0.0.1:8090' } },
  envPrefix: 'VITE_',
});

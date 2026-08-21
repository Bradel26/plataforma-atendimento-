import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    // Proxy mantem front e API na mesma origem em dev — o cookie de refresh
    // (httpOnly, sameSite=lax) funciona sem configuracao extra.
    proxy: {
      '/api': {
        target: 'http://localhost:3333',
        changeOrigin: false,
      },
    },
  },
});

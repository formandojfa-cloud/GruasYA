import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base relativa para que la demo funcione en cualquier ruta (GitHub Pages, artifact, etc.)
export default defineConfig({
  base: './',
  plugins: [react()],
});

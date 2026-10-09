import { execSync } from 'node:child_process';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Versión visible en Admin para saber qué compilación tiene cada teléfono.
function version(): string {
  const sha = process.env.GITHUB_SHA?.slice(0, 7);
  try {
    return sha ?? execSync('git rev-parse --short HEAD').toString().trim();
  } catch {
    return 'local';
  }
}

// base relativa para que la demo funcione en cualquier ruta (GitHub Pages, artifact, etc.)
export default defineConfig({
  base: './',
  plugins: [react()],
  define: { __VERSION__: JSON.stringify(`${version()} · ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC`) },
});

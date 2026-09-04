import { defineConfig } from 'vite';

export default defineConfig({
  root: '.',
  publicDir: 'public',
  base: './', // relative base: works on GitHub Pages subpath (/repo/) AND dev root
  server: {
    port: 3000,
    host: true,
    open: true,
  },
  optimizeDeps: {
    include: ['three', '@pixiv/three-vrm'],
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'esnext',
  },
});
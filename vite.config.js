import { defineConfig } from 'vite';

export default defineConfig({
  build: { chunkSizeWarningLimit: 1000 }, // three.js alone is ~500 kB
});

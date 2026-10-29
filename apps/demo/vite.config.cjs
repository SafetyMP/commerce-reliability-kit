// CJS avoids Vite's ESM config loader writing .vite-temp into read-only dependencies.
/** @type {import('vite').UserConfig} */
module.exports = {
  base: process.env.PAGES_BASE_PATH || './',
  cacheDir: '.vite-cache',
  server: { host: '127.0.0.1' },
  preview: { host: '127.0.0.1' },
  build: { outDir: 'dist', emptyOutDir: true },
};

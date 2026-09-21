import { defineConfig } from 'vite';

export default defineConfig({
  // Relative asset paths, so the build works both at the root of a custom
  // domain and under a /repo-name/ path on github.io. Without this the site
  // loads from one and 404s from the other.
  base: './',
  build: { target: 'es2022' },   // top-level await in main.js
});

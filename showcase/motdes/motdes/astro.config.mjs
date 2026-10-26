import { defineConfig } from 'astro/config';
import swup from '@swup/astro';

export default defineConfig({
  site: 'https://motdes.example',
  devToolbar: { enabled: false },
  integrations: [
    swup({
      theme: false,
      containers: ['main'],
      cache: true,
      preload: { hover: true, visible: false },
      progress: false,
      accessibility: true,
      smoothScrolling: false,
      updateHead: true,
      updateBodyClass: true,
      globalInstance: true,
    }),
  ],
  build: { inlineStylesheets: 'never' },
  vite: { assetsInclude: ['**/*.glb'] },
});

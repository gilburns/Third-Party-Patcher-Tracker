import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://tracker.thirdpartypatcher.org',
  trailingSlash: 'always',
  build: { format: 'directory' },
});

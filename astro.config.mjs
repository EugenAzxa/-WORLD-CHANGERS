import { defineConfig } from 'astro/config';

// Static build. `site` is the production domain (used for canonical URLs and the sitemap).
export default defineConfig({
  site: 'https://wcsiasc.org',
  trailingSlash: 'always',
  build: { format: 'directory' },
  devToolbar: { enabled: false },
});

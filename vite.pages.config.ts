import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/postcss';

const base = `${(process.env.PAGES_BASE_PATH || '').replace(/\/$/, '')}/`;
const siteUrl = process.env.PAGES_SITE_URL;

export default defineConfig({
  base,
  plugins: [
    react(),
    {
      name: 'pages-social-metadata',
      transformIndexHtml() {
        if (!siteUrl) return [];
        const url = new URL(`${siteUrl.replace(/\/$/, '')}/`);
        if (url.protocol !== 'https:') throw new Error('PAGES_SITE_URL must use HTTPS');
        return [
          { tag: 'meta', attrs: { property: 'og:url', content: url.href }, injectTo: 'head' },
          { tag: 'meta', attrs: { property: 'og:image', content: new URL('og.png', url).href }, injectTo: 'head' },
          { tag: 'meta', attrs: { name: 'twitter:image', content: new URL('og.png', url).href }, injectTo: 'head' },
        ];
      },
    },
  ],
  css: { postcss: { plugins: [tailwindcss()] } },
  define: {
    'process.env.NEXT_PUBLIC_TABLEBASE_ENDPOINT': JSON.stringify('https://tablebase.lichess.ovh/standard'),
  },
  build: { outDir: 'dist-pages' },
});

/// <reference types='vitest' />
import path from 'node:path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const ENV_PREFIXES = ['VITE_', 'API_', 'GA_', 'GA4_', 'G4A_', 'GOOGLE_'];

export default defineConfig(({ mode }) => {
  const workspaceRoot = path.resolve(import.meta.dirname, '../..');
  const loadedEnv = loadEnv(mode, workspaceRoot, ENV_PREFIXES);
  const resolveGaId = () =>
    (
      process.env.VITE_GA_MEASUREMENT_ID ||
      process.env.VITE_GA4_MEASUREMENT_ID ||
      process.env.VITE_G4A_TOKEN ||
      process.env.VITE_GA_TRACKING_ID ||
      process.env.GA_MEASUREMENT_ID ||
      process.env.GA4_MEASUREMENT_ID ||
      process.env.G4A_TOKEN ||
      process.env.GOOGLE_ANALYTICS_ID ||
      loadedEnv.VITE_GA_MEASUREMENT_ID ||
      loadedEnv.VITE_GA4_MEASUREMENT_ID ||
      loadedEnv.VITE_G4A_TOKEN ||
      loadedEnv.VITE_GA_TRACKING_ID ||
      loadedEnv.GA_MEASUREMENT_ID ||
      loadedEnv.GA4_MEASUREMENT_ID ||
      loadedEnv.G4A_TOKEN ||
      loadedEnv.GOOGLE_ANALYTICS_ID ||
      ''
    ).trim();

  return {
    root: import.meta.dirname,
    envDir: workspaceRoot,
    envPrefix: ENV_PREFIXES,
    cacheDir: '../../node_modules/.vite/apps/web',
    server: {
      port: 4200,
      host: 'localhost',
      proxy: {
        '/api': {
          target: 'http://127.0.0.1:8000',
          changeOrigin: true,
        },
      },
    },
    preview: {
      port: 4300,
      host: 'localhost',
    },
    resolve: {
      tsconfigPaths: true,
    },
    plugins: [
      tailwindcss(),
      react(),
      {
        name: 'html-inject-ga4',
        transformIndexHtml(html) {
          const gaId = resolveGaId();
          if (!gaId) return html;
          const encodedId = encodeURIComponent(gaId);
          const safeJsonId = JSON.stringify(gaId);
          const gaSnippet = [
            `    <!-- Google tag (gtag.js) -->`,
            `    <script async src="https://www.googletagmanager.com/gtag/js?id=${encodedId}"></script>`,
            `    <script>`,
            `      window.dataLayer = window.dataLayer || [];`,
            `      function gtag(){dataLayer.push(arguments);}`,
            `      window.gtag = window.gtag || gtag;`,
            `      gtag('js', new Date());`,
            `      gtag('config', ${safeJsonId}, { send_page_view: false });`,
            `    </script>`,
          ].join('\n');
          return html.replace('<head>', `<head>\n${gaSnippet}`);
        },
      },
    ],
    build: {
      outDir: '../../dist/apps/web',
      emptyOutDir: true,
      reportCompressedSize: true,
      commonjsOptions: {
        transformMixedEsModules: true,
      },
    },
  };
});


import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';
import { shareInstrumentCatalog } from './scripts/shareInstrumentCatalog.ts';

export default defineConfig(({ mode }) => {
  return {
    plugins: [react(), tailwindcss(), ...(mode === 'share' ? [{
      name: 'unbox-share-instrument-catalog',
      enforce: 'pre' as const,
      load(id: string) {
        if (path.resolve(id.split('?')[0]) === path.resolve(__dirname, 'shared/instruments/catalog.ts')) return shareInstrumentCatalog(__dirname);
        return undefined;
      },
    }] : [])],
    // `vite build --mode share` (npm run dist:win:share): only redistributable instrument packs.
    define: { __UNBOX_SHARE__: JSON.stringify(mode === 'share') },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'src'),
      },
    },
    build: {
      target: 'es2022',
      chunkSizeWarningLimit: 900,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('node_modules')) {
              if (id.includes('lucide-react')) {
                return 'vendor-icons';
              }
              if (id.includes('@breezystack/lamejs')) {
                return 'vendor-lame';
              }
              if (id.includes('react') || id.includes('motion')) {
                return 'vendor-ui';
              }
              return 'vendor-core';
            }
            if (id.includes('src/audio') || id.includes('src\\audio')) {
              return 'app-audio-engine';
            }
            if (id.includes('src/components/faceplates') || id.includes('src\\components\\faceplates')) {
              return 'app-faceplates';
            }
          },
        },
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      hmr: process.env.DISABLE_HMR !== 'true',
      // The in-app library and generated data are rewritten by the scanner while the server runs;
      // watching them is useless and Windows locks half-written files (EBUSY crash).
      watch:
        process.env.DISABLE_HMR === 'true'
          ? null
          : { ignored: ['**/public/library/**', '**/public/instruments/**', '**/public/samples/**', '**/data/**', '**/release/**', '**/dist/**'] },
    },
  };
});

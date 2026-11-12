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
              // Basic Pitch and TensorFlow.js load only when an AI transcription runs (a dynamic import), so they
              // stay out of the chunk the app loads at start-up.
              if (id.includes('@tensorflow') || id.includes('@spotify')) {
                return 'vendor-ai';
              }
              // Keep React, Motion, and their shared helpers together. Splitting
              // them into `vendor-ui` and `vendor-core` made Rollup emit a
              // circular chunk pair (core -> UI -> core), which in turn adds an
              // unnecessary preload/evaluation ordering hazard at app startup.
              return 'vendor-runtime';
            }
            // Basic Pitch's wrapper loads only when an AI transcription runs, so it gets a chunk of its own.
            // Only the model code: the small worker client (basicPitchClient.ts) is imported at start-up, and
            // matching it too made the start page preload this chunk and all of TensorFlow (~1 MB).
            if (/src[\\/]audio[\\/]ai[\\/]basicPitch(Notes)?\.ts/.test(id)) {
              return 'app-ai';
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
      // watching them is useless and Windows locks half-written files (EBUSY crash). `.tmp/` holds
      // build temp files and the test browsers' profiles (scripts/local-temp.mjs), which stay locked.
      watch:
        process.env.DISABLE_HMR === 'true'
          ? null
          : { ignored: ['**/.tmp/**', '**/public/library/**', '**/public/instruments/**', '**/public/samples/**', '**/data/**', '**/release/**', '**/dist/**'] },
    },
  };
});

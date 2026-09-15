import { defineConfig } from 'vite';
import { resolve } from 'path';
import { builtinModules } from 'module';

// Backend module bundle. Runs in an Electron utility-process (Node), loaded by
// the host's extensionBackendBootstrap via dynamic import. Node builtins stay
// external; everything else (this module has no npm deps beyond Node itself)
// gets bundled in, matching packages/extensions/nimbalyst-memory's split build.
export default defineConfig({
  mode: 'production',
  build: {
    lib: {
      entry: resolve(__dirname, 'src/backend.ts'),
      formats: ['es'],
      fileName: () => 'backend.js',
    },
    rollupOptions: {
      external: [/^node:/, ...builtinModules],
      output: { inlineDynamicImports: true },
    },
    target: 'node18',
    outDir: 'dist',
    // Do NOT wipe dist — the panel build (vite.config.ts) emits index.js here.
    emptyOutDir: false,
    sourcemap: false,
    minify: false,
  },
});

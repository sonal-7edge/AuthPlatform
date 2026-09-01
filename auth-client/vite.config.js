import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    // Bundled deps are the consumer's problem to dedupe, so leave modern
    // syntax in place and let their build target decide.
    target: 'es2020',
    lib: {
      entry: {
        // The single entry point (index) plus the narrower subpaths, which
        // stay for back-compat and for React-free consumers (`core`).
        index: './src/index.js',
        'core/index': './src/core/index.js',
        'react/index': './src/react/index.js',
        'ui/index': './src/ui/index.js',
      },
      formats: ['es', 'cjs'],
      fileName: (format, entryName) => `${entryName}.${format === 'es' ? 'js' : 'cjs'}`,
    },
    rollupOptions: {
      // Never bundle React or axios — the host app owns those instances.
      // Bundling React would produce two copies and break hooks.
      external: ['react', 'react-dom', 'react/jsx-runtime', 'axios'],
    },
  },
})

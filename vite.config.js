import { defineConfig } from 'vite';
export default defineConfig({
  build: { target: 'es2020', sourcemap: false, chunkSizeWarningLimit: 1200, rollupOptions: { output: { manualChunks: { three: ['three'], supabase: ['@supabase/supabase-js'] } } } },
});

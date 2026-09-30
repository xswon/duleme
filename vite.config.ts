import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import fs from 'node:fs';
import path from 'path';
import {defineConfig, type Plugin} from 'vite';

function sitesHostingMetadata(outDir: string): Plugin {
  return {
    name: 'sites-hosting-metadata',
    enforce: 'post',
    closeBundle() {
      const targetDirectory = path.join(outDir, '.openai');
      fs.mkdirSync(targetDirectory, {recursive: true});
      fs.copyFileSync(
        path.resolve(__dirname, '.openai/hosting.json'),
        path.join(targetDirectory, 'hosting.json'),
      );
      for (const entry of fs.readdirSync(outDir, {recursive: true, withFileTypes: true})) {
        if (entry.isFile() && entry.name === '.dev.vars') {
          fs.rmSync(path.join(entry.parentPath, entry.name));
        }
      }
    },
  };
}

export default defineConfig(async ({mode}) => {
  const isSitesBuild = mode === 'sites';
  const sitesOutDir = path.resolve(__dirname, 'dist');
  let sitesPlugins: Plugin[] = [];
  if (isSitesBuild) {
    process.env.WRANGLER_WRITE_LOGS ??= 'false';
    process.env.WRANGLER_LOG_PATH ??= path.resolve(__dirname, '.wrangler/logs');
    process.env.WRANGLER_REGISTRY_PATH ??= path.resolve(__dirname, '.wrangler/dev-registry');
    process.env.MINIFLARE_REGISTRY_PATH ??= path.resolve(__dirname, '.wrangler/registry');
    const {cloudflare} = await import('@cloudflare/vite-plugin');
    sitesPlugins = [
      cloudflare({inspectorPort: false, viteEnvironment: {name: 'server'}}),
      sitesHostingMetadata(sitesOutDir),
    ] as Plugin[];
  }
  return {
    plugins: [
      react(),
      tailwindcss(),
      ...sitesPlugins,
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});

import { defineConfig } from 'tsup';

const tsupConfig = defineConfig({
  entry: ['src/web/trpc/index.ts'],
  outDir: '.temp_transform',
  format: ['esm'],
  clean: true,
  dts: true,
  tsconfig: 'tsconfig.json',
});

export default tsupConfig;
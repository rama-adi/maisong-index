import { defineConfig } from 'tsup';

const tsupConfig = defineConfig({
  entry: ['src/web/trpc/index.ts'],
  outDir: '.temp_transform',
  format: ['esm'],
  clean: true,
  dts: true,
  tsconfig: 'tsconfig.json',
});

// eslint-disable-next-line
export default tsupConfig;
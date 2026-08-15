import swc from 'unplugin-swc'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    coverage: {
      include: ['src/**/*.ts'],
    },
    fileParallelism: false,
    // Snapshot/restore test/.homebridge around the run - the specs write mock
    // fixtures into it, and it is the same directory `npm run watch` uses
    globalSetup: ['./test/global-setup.ts'],
    include: ['test/**/*.e2e-spec.ts'],
  },
  plugins: [
    // This is required to build the test files with SWC
    swc.vite({
      // Explicitly set the module type to avoid inheriting this value from a `.swcrc` config file
      module: {
        type: 'es6',
      },
    }),
  ],
})

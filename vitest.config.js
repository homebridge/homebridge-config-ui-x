import process from 'node:process'

import swc from 'unplugin-swc'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    coverage: {
      include: ['src/**/*.ts'],
    },
    fileParallelism: false,
    // Vitest otherwise adds a large, mostly identical job summary to every
    // operating-system/Node.js combination in the release matrix. Keep GitHub
    // failure annotations, but leave the workflow-level summary concise.
    reporters: process.env.GITHUB_ACTIONS === 'true'
      ? [
          'default',
          ['github-actions', { jobSummary: { enabled: false } }],
        ]
      : ['default'],
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

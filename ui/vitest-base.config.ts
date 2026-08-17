import { defineConfig } from 'vitest/config'

/**
 * Extra Vitest configuration, merged on top of the one Angular's unit-test
 * builder generates.
 *
 * `@ng-formworks/core` imports `ajv/dist/2019` with no file extension. The
 * browser build resolves that fine, but under Vitest the package is left
 * external and loaded by Node's ESM resolver, which rejects an extensionless
 * specifier outright - so every spec that imports a component reaching the
 * schema form died on "Cannot find module". Aliasing the exact specifier fixes
 * it without touching the dependency or the production build.
 */
export default defineConfig({
  resolve: {
    alias: [
      { find: /^ajv\/dist\/2019$/, replacement: 'ajv/dist/2019.js' },
    ],
  },
  test: {
    // Each spec file gets its own module registry. Without this a `vi.mock`
    // only takes effect when that spec happens to be the first file to import
    // the module, so adding an unrelated spec elsewhere could silently strip
    // the mock out of another one.
    isolate: true,
    server: {
      deps: {
        // The alias only applies to imports Vite resolves itself, so the
        // package has to be processed rather than left external
        inline: [/@ng-formworks/],
      },
    },
  },
})

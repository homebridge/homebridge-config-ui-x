/**
 * Runs patch-package from the `prepare` script of the root package and the ui app.
 *
 * patch-package is a devDependency, but npm runs the project's own `prepare`
 * script even on production installs (`npm ci --omit=dev`), where patch-package
 * is not installed. Production installs don't need the patches — they only
 * matter when building from source — so skip silently in that case, and stay
 * strict (propagate failures) whenever patch-package is available.
 */

import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import process from 'node:process'

// Resolve from the invoking package (root or ui), not from this script's location
const require = createRequire(join(process.cwd(), 'package.json'))

let patchPackageBin
try {
  patchPackageBin = require.resolve('patch-package')
} catch {
  process.exit(0)
}

const result = spawnSync(process.execPath, [patchPackageBin], { stdio: 'inherit' })
process.exit(result.status ?? 1)

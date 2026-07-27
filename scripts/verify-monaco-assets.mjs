/**
 * Verifies that the Monaco files copied into the build output are complete.
 *
 * `ui/angular.json` copies Monaco into `assets/monaco` with a list of globs
 * rather than taking the whole package, to keep the ~80 languages we never use
 * out of the bundle. The catch is that Monaco content-hashes its chunk
 * filenames, and it renames them: the main bundle was `editor.api-<hash>.js` in
 * 0.55 and became `editor-<hash>.js` in 0.56, which also introduced several new
 * chunks. A glob that stops matching fails silently — the build succeeds, the
 * assets are simply absent, and the editor renders as a blank page at runtime.
 * That shipped in ten published betas before anyone noticed.
 *
 * Monaco's files are AMD modules that declare their dependencies up front, so
 * this walks the whole graph from `editor/editor.main.js` and checks every
 * relative module id resolves to a file that was actually copied. Lazily
 * fetched languages are not in any define() array, so they are correctly
 * ignored — only what the editor needs to start is checked.
 *
 * Runs automatically via the `postbuild:ui` script.
 */

import { existsSync, readFileSync } from 'node:fs'
import { dirname, relative, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const vsDir = resolve(__dirname, '../public/assets/monaco/min/vs')
const entry = resolve(vsDir, 'editor/editor.main.js')

if (!existsSync(entry)) {
  console.error(`[monaco] ${relative(process.cwd(), entry)} is missing — the Monaco assets were not copied at all.`)
  process.exit(1)
}

const RE_DEFINE = /define\(\s*(?:"[^"]*"\s*,\s*)?\[([^\]]*)\]/g

const checked = new Set()
const missing = new Map()

function walk(file, requiredBy) {
  const id = relative(vsDir, file)
  if (checked.has(id)) {
    return
  }
  checked.add(id)

  if (!existsSync(file)) {
    missing.set(id, requiredBy)
    return
  }

  const source = readFileSync(file, 'utf8')
  for (const match of source.matchAll(RE_DEFINE)) {
    for (const raw of match[1].split(',')) {
      const dep = raw.trim().replace(/^["']|["']$/g, '')
      // Only relative module ids come off disk. `exports`, `require` and the
      // `vs/nls...!` loader plugin are resolved by the AMD loader itself.
      if (dep.startsWith('./') || dep.startsWith('../')) {
        walk(`${resolve(dirname(file), dep)}.js`, id)
      }
    }
  }
}

walk(entry, null)

if (missing.size) {
  console.error('[monaco] These files are required to start the editor, but were not copied into assets/monaco/min/vs:')
  for (const [file, requiredBy] of missing) {
    console.error(`  - ${file}  (required by ${requiredBy})`)
  }
  console.error('\nMonaco has almost certainly renamed or added a chunk. Update the monaco globs in ui/angular.json to match.')
  process.exit(1)
}

console.log(`[monaco] editor asset graph complete — ${checked.size} modules checked.`)

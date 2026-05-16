// Regenerates the compact emoji short-name lookup used by the markdown component.
//
// We only ever call emoji-js's `replace_colons` to turn `:name:` into the
// native unicode emoji. Shipping the whole `emoji-js` library (~250 KB
// minified) for that is wasteful, so we distil its data down to a plain
// `{ shortName: "😀" }` map and bundle only that.
//
// Run this after bumping the `emoji-js` devDependency:
//   node scripts/emoji-shortnames.mjs
//
// `emoji-js` is a devDependency only — it must not be imported at runtime.

import { writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const outFile = join(here, '..', 'ui', 'src', 'app', 'core', 'components', 'markdown', 'emoji-shortnames.json')

// Resolve `emoji-js` from ui/node_modules (it's a ui devDependency).
// pathToFileURL: dynamic import() rejects bare Windows paths (e.g. `D:\...`).
const uiRequire = createRequire(resolve(here, '../ui/package.json'))
const { default: EmojiConvertor } = await import(pathToFileURL(uiRequire.resolve('emoji-js')).href)

const emoji = new EmojiConvertor()

// emoji.data shape: { codepoint: [ [chars...], _, _, [shortNames...], ... ] }
const map = {}
for (const entry of Object.values(emoji.data)) {
  const char = entry?.[0]?.[0]
  const names = entry?.[3]
  if (!char || !Array.isArray(names)) {
    continue
  }
  for (const name of names) {
    // First definition wins (matches emoji-js precedence).
    if (!(name in map)) {
      map[name] = char
    }
  }
}

const sorted = Object.fromEntries(Object.keys(map).sort().map(k => [k, map[k]]))
writeFileSync(outFile, `${JSON.stringify(sorted, null, 2)}\n`)

console.log(`Wrote ${Object.keys(sorted).length} emoji short-names to ${outFile}`)

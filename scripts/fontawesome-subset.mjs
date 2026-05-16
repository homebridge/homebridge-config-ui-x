/**
 * Subsets the Font Awesome web fonts down to only the icons referenced in the
 * UI source, then overwrites the fonts inside the installed
 * `@fortawesome/fontawesome-free` package so the Angular build bundles the
 * smaller files.
 *
 * Nothing in the Font Awesome SCSS or in any template/component is changed, so
 * the icon CSS, the v4 shim layer and dynamically-applied icon classes all keep
 * working — only the font binaries shrink.
 *
 * Runs automatically via the `prebuild` script in `ui/package.json`. It reads
 * the source fonts and writes the subset back to the same files; a fresh
 * `npm install` always restores the full fonts before this runs again.
 */

import { statSync } from 'node:fs'
import { readdir, readFile, stat } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const uiSrc = resolve(__dirname, '../ui/src')
const uiRequire = createRequire(resolve(__dirname, '../ui/package.json'))

// pathToFileURL: dynamic import() rejects bare Windows paths (e.g. `D:\...`).
const { fontawesomeSubset } = await import(
  pathToFileURL(uiRequire.resolve('fontawesome-subset')).href,
)
const faWebfontsDir = resolve(
  dirname(uiRequire.resolve('@fortawesome/fontawesome-free/package.json')),
  'webfonts',
)

// Font Awesome utility / sizing / animation / layout classes — not glyphs.
const NON_GLYPH = new Set([
  'fw',
  'sm',
  'xs',
  'lg',
  'xl',
  '2xs',
  '2xl',
  '1x',
  '2x',
  '3x',
  '4x',
  '5x',
  '6x',
  '7x',
  '8x',
  '9x',
  '10x',
  'spin',
  'pulse',
  'spin-pulse',
  'spin-reverse',
  'beat',
  'fade',
  'beat-fade',
  'bounce',
  'shake',
  'flip',
  'border',
  'pull-left',
  'pull-right',
  'inverse',
  'stack',
  'stack-1x',
  'stack-2x',
  'li',
  'rotate-90',
  'rotate-180',
  'rotate-270',
  'rotate-by',
  'flip-horizontal',
  'flip-vertical',
  'flip-both',
  'sr-only',
  'sr-only-focusable',
  'solid',
  'regular',
  'brands',
  'classic',
  'sharp',
  'blank',
])

async function collectIconNames(dir, found) {
  for (const entry of await readdir(dir)) {
    const full = resolve(dir, entry)
    if ((await stat(full)).isDirectory()) {
      await collectIconNames(full, found)
      continue
    }
    if (!/\.(?:html|ts)$/.test(entry)) {
      continue
    }
    const content = await readFile(full, 'utf8')
    for (const match of content.matchAll(/\bfa-([a-z0-9]+(?:-[a-z0-9]+)*)/g)) {
      const name = match[1]
      if (!NON_GLYPH.has(name)) {
        found.add(name)
      }
    }
  }
}

function fileSize(path) {
  try {
    return statSync(path).size
  } catch {
    return 0
  }
}

const icons = new Set()
await collectIconNames(uiSrc, icons)
const names = [...icons].sort()

const fonts = ['fa-solid-900.woff2', 'fa-regular-400.woff2', 'fa-brands-400.woff2']
const before = Object.fromEntries(
  fonts.map(f => [f, fileSize(resolve(faWebfontsDir, f))]),
)

// Feed the same name list to every family; fontawesome-subset only emits an
// icon into a family's font if that family actually contains it, and silently
// skips the rest — so over-inclusion is safe and guarantees no missing glyph.
await fontawesomeSubset(
  { solid: names, regular: names, brands: names },
  faWebfontsDir,
)

const kib = n => `${(n / 1024).toFixed(1)} KiB`
console.log(`[fa-subset] ${names.length} icon names referenced in ui/src`)
for (const f of fonts) {
  const b = before[f]
  const a = fileSize(resolve(faWebfontsDir, f))
  console.log(`[fa-subset] ${f}: ${kib(b)} -> ${kib(a)}`)
}

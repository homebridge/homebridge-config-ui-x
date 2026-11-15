import { readdir, readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

const uiApp = resolve(__dirname, '../../ui/src/app')
const enPath = resolve(__dirname, '../../ui/src/i18n/en.json')

async function sourceFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true })
  const files = await Promise.all(entries.map(async (entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) {
      return sourceFiles(path)
    }
    return /\.(?:ts|html)$/.test(entry.name) && !entry.name.endsWith('.spec.ts')
      ? [path]
      : []
  }))
  return files.flat()
}

// A whole key written out in the code: `'a.b' | translate`, or `.instant('a.b')` / `.get('a.b')` on the service
const RE_PIPE_KEY = /'([a-z0-9_]+(?:\.[\w-]+)+)'\s*\|\s*translate/g
const RE_INSTANT_KEY = /\$translate\.(?:instant|get|stream)\(\s*'([a-z0-9_]+(?:\.[\w-]+)+)'/g

describe('the ui translations', () => {
  it('has an english text for every key the ui writes out in full', async () => {
    const en: Record<string, string> = JSON.parse(await readFile(enPath, 'utf8'))
    const missing = new Set<string>()
    for (const file of await sourceFiles(uiApp)) {
      const text = await readFile(file, 'utf8')
      for (const re of [RE_PIPE_KEY, RE_INSTANT_KEY]) {
        for (const [, key] of text.matchAll(re)) {
          if (!(key in en)) {
            missing.add(`${key} (${file.slice(uiApp.length + 1)})`)
          }
        }
      }
    }
    // A missing key shows the raw key to the user, and a screen reader reads it out
    expect([...missing].sort()).toEqual([])
  })
})

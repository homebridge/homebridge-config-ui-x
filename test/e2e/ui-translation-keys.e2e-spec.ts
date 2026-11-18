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

  it('has an english text for every key-shaped text in the ui, also in a ternary, a helper call or a template', async () => {
    // The test above only sees `'key' | translate` and `$translate.instant('key')`. A key inside a ternary
    // (`(x ? 'a.b' : 'c.d') | translate`), passed to a helper, or in a list piped later, is checked here: any quoted
    // text that looks like a key and starts with one of en.json's first parts
    const en: Record<string, string> = JSON.parse(await readFile(enPath, 'utf8'))
    const keys = Object.keys(en)
    const prefixes = new Set(keys.map(key => key.split('.')[0]))
    // Not translation keys: the messages a custom plugin ui sends, and a file name
    const notKeys = new Set([
      'config.get',
      'config.json',
      'config.save',
      'config.schema',
      'config.update',
      'form.create',
      'form.end',
      'toast.error',
      'toast.info',
      'toast.success',
      'toast.warning',
    ])
    const missing = new Set<string>()
    for (const file of await sourceFiles(uiApp)) {
      const text = await readFile(file, 'utf8')
      for (const [, key] of text.matchAll(/['"`]([a-z0-9_]+(?:\.[a-z0-9_-]+)+)['"`]/g)) {
        if (!prefixes.has(key.split('.')[0]) || key in en || notKeys.has(key)) {
          continue
        }
        // The start of a key the code finishes itself (`'update_all.reason_' + reason`)
        if (keys.some(known => known.startsWith(`${key}.`) || known.startsWith(`${key}_`))) {
          continue
        }
        missing.add(`${key} (${file.slice(uiApp.length + 1)})`)
      }
    }
    expect([...missing].sort()).toEqual([])
  })
})

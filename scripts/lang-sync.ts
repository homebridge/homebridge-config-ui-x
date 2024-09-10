/**
 * Script to:
 * - copy new english translation strings to the other language files
 * - remove old translation strings from the other language files
 */

import { dirname, resolve } from 'node:path'

import { readdirSync, readJsonSync, writeJSONSync } from 'fs-extra'

const basePath = dirname(__dirname)

const langFiles = readdirSync(resolve(basePath, 'ui/src/i18n'))
  .filter(x => x.endsWith('.json'))

const main = readJsonSync(resolve(basePath, 'ui/src/i18n/en.json'))

for (const lang of langFiles) {
  const langPath = resolve(basePath, 'ui/src/i18n', lang)
  const translationStrings = readJsonSync(langPath)

  if (lang !== 'en.json') {
    // find any keys in the main file that are not in the translation file, and add
    for (const [key, value] of Object.entries(main)) {
      if (!Object.prototype.hasOwnProperty.call(translationStrings, key)) {
        translationStrings[key] = value
      }
    }

    // find any keys in the translation file that are not in the main file, and remove
    for (const key of Object.keys(translationStrings)) {
      if (!Object.prototype.hasOwnProperty.call(main, key)) {
        delete translationStrings[key]
      }
    }
  }

  // sort keys
  const ordered = {}
  Object.keys(translationStrings).sort().forEach((key) => {
    ordered[key] = translationStrings[key]
  })

  writeJSONSync(langPath, ordered, { spaces: 2 })
}

/**
 * Script to:
 * - copy new english translation strings to the other language files
 * - remove old translation strings from the other language files
 * - output any keys that it does not think are used in the project
 */

import { dirname, resolve } from 'node:path'

import { readdir, readFile, readJson, stat, writeJson } from 'fs-extra'

// Path to the project directory
const projectDir = resolve(dirname(__dirname), 'ui/src')

const ignoreKeys = [
  'plugins.settings.custom.homebridge-gsh.label_account_linked',
  'plugins.settings.custom.homebridge-gsh.label_link_account',
  'plugins.settings.custom.homebridge-gsh.message_about',
  'plugins.settings.custom.homebridge-gsh.message_account_link_required',
  'plugins.settings.custom.homebridge-gsh.message_homebridge_restart_required',
]

async function getAllFiles(dirPath: string, arrayOfFiles: string[] = []): Promise<string[]> {
  const files = await readdir(dirPath)

  for (const file of files) {
    const filePath = resolve(dirPath, file)
    const fileStat = await stat(filePath)
    if (fileStat.isDirectory()) {
      if (filePath !== resolve(projectDir, 'i18n')) {
        arrayOfFiles = await getAllFiles(filePath, arrayOfFiles)
      }
    } else {
      arrayOfFiles.push(filePath)
    }
  }

  return arrayOfFiles
}

// Function to check if a key is used in a file
async function isKeyUsedInFile(key: string, filePath: string): Promise<boolean> {
  const fileContent = await readFile(filePath, 'utf8')
  return fileContent.includes(key)
}

async function main() {
  // Read the main JSON file
  const basePath = dirname(__dirname)
  const mainFilePath = resolve(basePath, 'ui/src/i18n/en.json')
  const main = await readJson(mainFilePath)

  // Extract the keys
  const keys = Object.keys(main)

  // Get all files in the project directory
  const allFiles = await getAllFiles(projectDir)

  // Check each key
  const unusedKeys = []
  for (const key of keys) {
    if (ignoreKeys.includes(key)) {
      continue // Skip ignored keys
    }

    const isUsed = await Promise.all(allFiles.map(file => isKeyUsedInFile(key, file)))
      .then(results => results.some(result => result))
    if (!isUsed) {
      unusedKeys.push(key)
    }
  }

  // Output the unused keys
  if (unusedKeys.length > 0) {
    console.log('Unused keys:', unusedKeys)
  } else {
    console.log('All keys are used.')
  }

  // Existing code for syncing translation files
  const langFiles = (await readdir(resolve(basePath, 'ui/src/i18n')))
    .filter(x => x.endsWith('.json'))

  for (const lang of langFiles) {
    const langPath = resolve(basePath, 'ui/src/i18n', lang)
    const translationStrings = await readJson(langPath)

    if (lang !== 'en.json') {
      // Find any keys in the main file that are not in the translation file, and add
      for (const [key, value] of Object.entries(main)) {
        if (!Object.prototype.hasOwnProperty.call(translationStrings, key)) {
          translationStrings[key] = value
        }
      }

      // Find any keys in the translation file that are not in the main file, and remove
      for (const key of Object.keys(translationStrings)) {
        if (!Object.prototype.hasOwnProperty.call(main, key)) {
          delete translationStrings[key]
        }
      }
    }

    // Sort keys
    const ordered = {}
    Object.keys(translationStrings).sort().forEach((key) => {
      ordered[key] = translationStrings[key]
    })

    await writeJson(langPath, ordered, { spaces: 2 })
  }
}

// Call the main function
main().catch(error => console.error(error))

/**
 * Script to:
 * - copy new english translation strings to the other language files
 * - remove old translation strings from the other language files
 */

import * as path from 'path';
import * as fs from 'fs-extra';

const basePath = path.dirname(__dirname);

const langFiles = fs.readdirSync(path.resolve(basePath, 'ui/src/i18n'))
  .filter(x => x.endsWith('.json'));

const main = fs.readJsonSync(path.resolve(basePath, 'ui/src/i18n/en.json'));

for (const lang of langFiles) {
  const langPath = path.resolve(basePath, 'ui/src/i18n', lang);
  const translationStrings = fs.readJsonSync(langPath);

  if (lang !== 'en.json') {
    // find any keys in the main file that are not in the translation file, and add
    for (const [key, value] of Object.entries(main)) {
      if (!translationStrings.hasOwnProperty(key)) {
        translationStrings[key] = value;
      }
    }

    // find any keys in the translation file that are not in the main file, and remove
    for (const key of Object.keys(translationStrings)) {
      if (!main.hasOwnProperty(key)) {
        delete translationStrings[key];
      }
    }
  }

  // sort keys
  const ordered = {};
  Object.keys(translationStrings).sort().forEach((key) => {
    ordered[key] = translationStrings[key];
  });

  fs.writeJSONSync(langPath, ordered, { spaces: 4 });
}

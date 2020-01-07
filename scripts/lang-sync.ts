
/**
 * Script to copy new english translation strings to the other language files
 */

import * as fs from 'fs-extra';
import * as path from 'path';

const basePath = path.dirname(__dirname);

const langFiles = fs.readdirSync(path.resolve(basePath, 'ui/src/i18n'))
  .filter(x => x.endsWith('.json'));

const master = fs.readJsonSync(path.resolve(basePath, 'ui/src/i18n/en.json'));

for (const lang of langFiles) {
  const langPath = path.resolve(basePath, 'ui/src/i18n', lang);
  const translationStrings = fs.readJsonSync(langPath);

  if (lang !== 'en.json') {
    for (const [key, value] of Object.entries(master)) {
      if (!translationStrings.hasOwnProperty(key)) {
        translationStrings[key] = value;
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
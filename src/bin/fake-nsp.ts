#!/usr/bin/env node

/* this file lets the self-upgrade complete without error */

import * as path from 'path';
import * as fs from 'fs-extra';

(async function () {
  const targetDir = path.resolve(require.resolve('@oznu/hap-client'), '../../../../nsp');
  const packageJson = path.resolve(targetDir, 'package.json');

  await fs.ensureFile(packageJson);
  await fs.ensureFile(path.resolve(targetDir, 'lib/index.js'));
  await fs.ensureFile(path.resolve(targetDir, 'bin/nsp'));

  await fs.writeJson(packageJson, {
    name: 'nsp',
    version: '3.2.1',
    main: 'lib/index.js',
    bin: {
      nsp: 'bin/nsp'
    },
  }, { spaces: 4 });
}());

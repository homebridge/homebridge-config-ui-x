import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const rootPackage = JSON.parse(await readFile(resolve('package.json'), 'utf8'))
const manifest = {
  name: 'homebridge-smart-automation',
  displayName: 'Homebridge Smart Automation',
  private: true,
  version: rootPackage.version,
  type: 'module',
  main: './plugin.js',
  keywords: [
    'homebridge-plugin',
    'supports-hap',
  ],
  engines: {
    node: rootPackage.engines.node,
    homebridge: rootPackage.engines.homebridge,
  },
}

await writeFile(
  resolve('dist/smart-automation/package.json'),
  `${JSON.stringify(manifest, null, 2)}\n`,
)

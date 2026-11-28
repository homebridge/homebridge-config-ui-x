import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { getStartupConfig } from '../../src/core/config/config.startup.js'

describe('the start-up config', () => {
  let dir: string
  const before = process.env.UIX_CONFIG_PATH

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'uix-startup-'))
    process.env.UIX_CONFIG_PATH = join(dir, 'config.json')
  })

  afterEach(async () => {
    process.env.UIX_CONFIG_PATH = before
    await rm(dir, { recursive: true, force: true })
  })

  it('starts without ssl, instead of not at all, when a configured ssl file is missing', async () => {
    await writeFile(process.env.UIX_CONFIG_PATH, JSON.stringify({
      bridge: {},
      platforms: [
        {
          platform: 'config',
          ssl: {
            key: join(dir, 'missing.key'),
            cert: join(dir, 'missing.crt'),
          },
        },
      ],
    }))

    const config = await getStartupConfig()

    expect(config.httpsOptions).toBeUndefined()
  })
})

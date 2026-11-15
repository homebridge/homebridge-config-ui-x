import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'

import { NotFoundException } from '@nestjs/common'
import { describe, expect, it, vi } from 'vitest'

import { SpaFilter } from '../../src/core/spa/spa.filter.js'

function hostFor(url: string) {
  const res = {
    code: vi.fn(() => res),
    send: vi.fn(),
    type: vi.fn(),
    header: vi.fn(),
  }
  const host: any = {
    switchToHttp: () => ({
      getRequest: () => ({ url }),
      getResponse: () => res,
    }),
  }
  return { host, res }
}

describe('the not-found filter', () => {
  it('keeps the reason an api route gave for a 404, as json', () => {
    const { host, res } = hostFor('/api/plugins/homebridge-x')

    new SpaFilter().catch(new NotFoundException('Plugin homebridge-x is not installed.'), host)

    expect(res.code).toHaveBeenCalledWith(404)
    expect(res.send).toHaveBeenCalledWith(expect.objectContaining({ message: 'Plugin homebridge-x is not installed.', statusCode: 404 }))
  })

  it('still answers a missing asset with a plain 404', () => {
    const { host, res } = hostFor('/assets/missing.png')

    new SpaFilter().catch(new NotFoundException(), host)

    expect(res.send).toHaveBeenCalledWith('Not Found')
  })

  it('serves the index.html that is on disk now, as a ui update replaces it before the ui restarts', async () => {
    // Regression: it was read once and kept, so after an update a reload on /plugins got the old page, whose
    // script files were gone
    const base = await mkdtemp(join(tmpdir(), 'spa-'))
    const before = process.env.UIX_BASE_PATH
    process.env.UIX_BASE_PATH = base
    try {
      await mkdir(join(base, 'public'))
      const filter = new SpaFilter()
      await writeFile(join(base, 'public', 'index.html'), 'old page')
      const first = hostFor('/plugins')
      filter.catch(new NotFoundException(), first.host)

      await writeFile(join(base, 'public', 'index.html'), 'new page')
      const second = hostFor('/plugins')
      filter.catch(new NotFoundException(), second.host)

      expect(first.res.send).toHaveBeenCalledWith('old page')
      expect(second.res.send).toHaveBeenCalledWith('new page')
    } finally {
      process.env.UIX_BASE_PATH = before
      await rm(base, { recursive: true, force: true })
    }
  })
})

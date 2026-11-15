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
})

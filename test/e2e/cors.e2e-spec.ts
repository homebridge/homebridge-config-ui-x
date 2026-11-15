import process from 'node:process'

import { afterEach, describe, expect, it } from 'vitest'

import { devServerCorsConfig } from '../../src/core/cors.config.js'

function allows(origin: string | undefined): boolean {
  let result: boolean | undefined
  devServerCorsConfig.origin(origin, (_err, allow) => {
    result = allow
  })
  return result
}

describe('cors config', () => {
  const before = process.env.UIX_DEVELOPMENT

  afterEach(() => {
    if (before === undefined) {
      delete process.env.UIX_DEVELOPMENT
    } else {
      process.env.UIX_DEVELOPMENT = before
    }
  })

  it('allows no other origin outside development, even on the dev server ports', () => {
    delete process.env.UIX_DEVELOPMENT
    expect(allows('http://evil.example:8080')).toBe(false)
    expect(allows('https://attacker.com:4200')).toBe(false)
    expect(allows('http://192.168.1.5:8080')).toBe(false)
    expect(allows('http://localhost:4200')).toBe(false)
  })

  it('allows a request with no origin (same origin, or not a browser)', () => {
    delete process.env.UIX_DEVELOPMENT
    expect(allows(undefined)).toBe(true)
  })

  it('allows the angular dev server on any host in development', () => {
    process.env.UIX_DEVELOPMENT = '1'
    expect(allows('http://localhost:4200')).toBe(true)
    expect(allows('http://192.168.1.5:4200')).toBe(true)
    expect(allows('http://localhost:9999')).toBe(false)
  })
})

import { describe, expect, it } from 'vitest'

import { redactConfig } from './config-redaction.helper'

describe('redactConfig', () => {
  it('masks common secrets recursively without altering the source or ordinary settings', () => {
    const source = {
      bridge: { name: 'Test bridge', pin: '000-00-000' },
      platforms: [{ password: 'secret-one', api_key: 'secret-two', nested: [{ refreshToken: 'secret-three' }], port: 1234 }],
      privateKey: { nested: 'secret-four' },
    }
    const input = JSON.stringify(source)
    const preview = redactConfig(input)!
    expect(preview).not.toContain('secret-')
    expect(JSON.parse(preview)).toEqual({
      bridge: { name: 'Test bridge', pin: '********' },
      platforms: [{ password: '********', api_key: '********', nested: [{ refreshToken: '********' }], port: 1234 }],
      privateKey: '********',
    })
    expect(JSON.stringify(source)).toBe(input)
  })

  it('supports relaxed JSON and drops comments which may contain secrets', () => {
    expect(redactConfig('{password: "synthetic", /* secret-comment */ port: 1234,}')).toBe(
      '{\n    "password": "********",\n    "port": 1234\n}',
    )
  })

  it('never displays raw text when parsing fails', () => {
    expect(redactConfig('{"password":"unfinished-secret')).toBeNull()
  })
})

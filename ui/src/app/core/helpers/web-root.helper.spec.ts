import { describe, expect, it } from 'vitest'

import { readWebRoot } from './web-root.helper'

/**
 * ⚠️ The same cases as the server has in test/e2e/web-root.e2e-spec.ts. A value this lets through and the
 * server refuses would be saved, and then not used.
 */
describe('reading a typed web root', () => {
  it.each([
    ['/homebridge', '/homebridge'],
    ['homebridge', '/homebridge'],
    ['/homebridge/', '/homebridge'],
    ['  /homebridge  ', '/homebridge'],
    ['/home/hb-ui_1.2~x', '/home/hb-ui_1.2~x'],
  ])('saves %j as %j', (typed, saved) => {
    expect(readWebRoot(typed)).toBe(saved)
  })

  it.each([
    ['nothing', null],
    ['an empty box', ''],
    ['only spaces', '   '],
    ['the root itself', '/'],
  ])('saves %s as no web root', (_case, typed) => {
    expect(readWebRoot(typed)).toBe('')
  })

  it.each([
    ['a space', '/home bridge'],
    ['an empty part', '/home//bridge'],
    ['a parent folder part', '/home/../bridge'],
    ['a part that is only dots', '/./homebridge'],
    ['html', '/"><script>alert(1)</script>'],
    ['a cookie attribute', '/hb; Domain=example.com'],
    ['a full address', 'https://example.com/homebridge'],
    ['a query', '/homebridge?x=1'],
    ['a percent code', '/home%2Fbridge'],
    ['more than 100 characters', `/${'a'.repeat(100)}`],
  ])('refuses a value with %s', (_case, typed) => {
    expect(readWebRoot(typed)).toBeNull()
  })

  it.each([
    '/api',
    '/assets',
    '/media',
    '/socket.io',
    '/swagger',
    '/api/homebridge',
    '/Assets',
  ])('refuses %s, which the server uses itself', (typed) => {
    expect(readWebRoot(typed)).toBeNull()
  })
})

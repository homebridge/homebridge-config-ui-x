import { describe, expect, it } from 'vitest'

import {
  RE_ANSI,
  RE_CRON_FIELD,
  RE_HAP_NAME_PATTERN,
  RE_HOSTNAME_PLACEHOLDER,
  RE_INVALID_HAP_NAME_CHARS,
  RE_KOFI,
  RE_UPPER,
  RE_USERNAME,
} from '@/app/core/regex.constants'

describe('regex constants', () => {
  describe('RE_USERNAME', () => {
    it.each([
      ['0E:89:49:64:91:86', true],
      ['0e:89:49:64:91:86', true],
      ['0E:89:49:64:91', false],
      ['0E-89-49-64-91-86', false],
      ['0E:89:49:64:91:8G', false],
      ['0E:89:49:64:91:86:AA', false],
      ['', false],
    ])('matches %s: %s', (value, expected) => {
      expect(RE_USERNAME.test(value)).toBe(expected)
    })
  })

  describe('RE_HAP_NAME_PATTERN', () => {
    it.each([
      ['Living Room', true],
      ['Ben\'s Lamp', true],
      ['Bridge 2', true],
      ['Küche', true],
      ['照明', true],
      [' Leading space', false],
      ['Trailing space ', false],
      ['Has-a-dash', false],
      ['Emoji 💡', false],
    ])('accepts %s: %s', (value, expected) => {
      expect(RE_HAP_NAME_PATTERN.test(value)).toBe(expected)
    })

    it('rejects a one-character name, which is a real name a user might pick', () => {
      // The pattern needs a start character, a middle and an end character, so
      // anything shorter than two characters can never match
      expect(RE_HAP_NAME_PATTERN.test('A')).toBe(false)
      expect(RE_HAP_NAME_PATTERN.test('AB')).toBe(true)
    })

    it('strips exactly the characters the name pattern forbids', () => {
      expect('Ben\'s Lamp-2 💡'.replace(RE_INVALID_HAP_NAME_CHARS, '')).toBe('Ben\'s Lamp2 ')
    })
  })

  describe('RE_CRON_FIELD', () => {
    it.each([
      ['*', true],
      ['0', true],
      ['*/15', true],
      ['1,2,3', true],
      ['1-5', true],
      ['MON', false],
      ['1 2', false],
      ['', false],
    ])('accepts cron field %s: %s', (value, expected) => {
      expect(RE_CRON_FIELD.test(value)).toBe(expected)
    })
  })

  describe('RE_ANSI', () => {
    it('strips the colour codes a log line arrives with', () => {
      expect('[36m[homebridge][39m started'.replace(RE_ANSI, '')).toBe('[homebridge] started')
    })
  })

  describe('RE_HOSTNAME_PLACEHOLDER', () => {
    it('replaces every occurrence of the placeholder', () => {
      // eslint-disable-next-line no-template-curly-in-string -- this is the literal placeholder text, not a template literal
      const source = '${{HOSTNAME}} and ${{HOSTNAME}}'

      expect(source.replace(RE_HOSTNAME_PLACEHOLDER, 'pi')).toBe('pi and pi')
    })
  })

  describe('RE_KOFI', () => {
    it.each(['ko-fi', 'kofi', 'Ko-Fi'])('recognises %s', (value) => {
      expect(RE_KOFI.test(value)).toBe(true)
    })
  })

  describe('the global flag trap', () => {
    it('makes a second identical test() call return false', () => {
      // A /g regex carries lastIndex between calls, so any of these constants
      // used with .test() must have lastIndex reset first. Shared module-level
      // regexes make this easy to hit and hard to see.
      RE_UPPER.lastIndex = 0

      expect(RE_UPPER.test('A')).toBe(true)
      expect(RE_UPPER.test('A')).toBe(false)

      RE_UPPER.lastIndex = 0
      expect(RE_UPPER.test('A')).toBe(true)

      RE_UPPER.lastIndex = 0
    })
  })
})

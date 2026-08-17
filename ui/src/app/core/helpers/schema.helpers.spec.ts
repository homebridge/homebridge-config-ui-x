import { TestBed } from '@angular/core/testing'
import { TranslateService } from '@ngx-translate/core'
import { beforeEach, describe, expect, it } from 'vitest'

import { createChildBridgeSchema } from '@/app/core/helpers/child-bridges-schema.helper'
import { createHapSchema } from '@/app/core/helpers/hap-schema.helper'
import { createMatterSchema } from '@/app/core/helpers/matter-schema.helper'
import { provideTestTranslate } from '@/testing/providers'

describe('schema helpers', () => {
  let translate: TranslateService

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideTestTranslate()],
    })
    translate = TestBed.inject(TranslateService)
  })

  describe('createHapSchema', () => {
    it('is a plain boolean when the runtime supports neither nested option', () => {
      const schema = createHapSchema(translate, false, 'child') as any

      expect(schema.type).toBe('boolean')
      expect(schema.oneOf).toBeUndefined()
    })

    it('still accepts the legacy boolean once the nested form is available', () => {
      // Configs written by an older UI must stay valid
      const schema = createHapSchema(translate, true, 'child') as any

      expect(schema.oneOf[0]).toEqual({ type: 'boolean' })
      expect(schema.oneOf[1].type).toBe('object')
    })

    it.each([
      [true, false, ['enabled', 'externalsOnly']],
      [false, true, ['enabled', 'disableIdentifyingMaterial']],
      [true, true, ['enabled', 'externalsOnly', 'disableIdentifyingMaterial']],
    ])('offers only the supported options (externalsOnly=%s, identifyingMaterial=%s)', (externals, identifying, expected) => {
      const schema = createHapSchema(translate, externals, 'child', identifying) as any

      expect(Object.keys(schema.oneOf[1].properties)).toEqual(expected)
    })

    it('words the description for the bridge it belongs to', () => {
      const main = createHapSchema(translate, false, 'main') as any
      const child = createHapSchema(translate, false, 'child') as any

      expect(main.description).toContain('the main bridge')
      expect(child.description).toContain('this child bridge')
    })
  })

  describe('createMatterSchema', () => {
    it('always offers enabled and port, and nothing undeclared', () => {
      const schema = createMatterSchema(translate, false, 'child') as any

      expect(Object.keys(schema.properties)).toEqual(['enabled', 'port'])
      expect(schema.additionalProperties).toBe(false)
    })

    it('bounds the port to the range homebridge accepts', () => {
      const schema = createMatterSchema(translate, false, 'child') as any

      expect(schema.properties.port.minimum).toBe(1025)
      expect(schema.properties.port.maximum).toBe(65534)
    })

    it.each([
      [true, false, ['enabled', 'port', 'externalsOnly']],
      [false, true, ['enabled', 'port', 'disableIpv4']],
      [true, true, ['enabled', 'port', 'externalsOnly', 'disableIpv4']],
    ])('offers only the supported options (externalsOnly=%s, disableIpv4=%s)', (externals, ipv4, expected) => {
      const schema = createMatterSchema(translate, externals, 'child', ipv4) as any

      expect(Object.keys(schema.properties)).toEqual(expected)
    })
  })

  describe('createChildBridgeSchema', () => {
    const base = { isDebugModeEnabled: false, isMatterSupported: false }

    it('requires only a username', () => {
      const schema = createChildBridgeSchema(translate, base) as any

      expect(schema.required).toEqual(['username'])
      expect(schema.additionalProperties).toBe(false)
    })

    it.each([
      ['0E:89:49:64:91:86', true],
      ['0e:89:49:64:91:86', true],
      ['0E:89:49:64:91', false],
      ['0E-89-49-64-91-86', false],
      ['not a mac', false],
    ])('validates username %s: %s', (value, expected) => {
      const schema = createChildBridgeSchema(translate, base) as any

      expect(new RegExp(schema.properties.username.pattern).test(value)).toBe(expected)
    })

    it.each([
      ['630-27-655', true],
      ['031-45-154', true],
      ['63027655', false],
      ['630-276-55', false],
    ])('validates pin %s: %s', (value, expected) => {
      const schema = createChildBridgeSchema(translate, base) as any

      expect(new RegExp(schema.properties.pin.pattern).test(value)).toBe(expected)
    })

    it('includes the debug option only when debug mode is on', () => {
      expect(createChildBridgeSchema(translate, base).properties).not.toHaveProperty('debugModeEnabled')
      expect(createChildBridgeSchema(translate, { ...base, isDebugModeEnabled: true }).properties)
        .toHaveProperty('debugModeEnabled')
    })

    it.each([
      [{ isMatterSupported: false, isPlatformPlugin: true }, false],
      [{ isMatterSupported: true, isPlatformPlugin: false }, false],
      [{ isMatterSupported: true, isPlatformPlugin: true }, true],
    ])('includes matter for %o: %s', (options, expected) => {
      // Matter only works with platform plugins, so both must be true
      const schema = createChildBridgeSchema(translate, { ...base, ...options }) as any

      expect('matter' in schema.properties).toBe(expected)
    })

    it('passes the feature flags down to the nested hap and matter schemas', () => {
      const schema = createChildBridgeSchema(translate, {
        ...base,
        isMatterSupported: true,
        isProtocolExternalsOnlyEnabled: true,
        isMatterDisableIpv4Enabled: true,
        isHapDisableIdentifyingMaterialEnabled: true,
      }) as any

      expect(Object.keys(schema.properties.hap.oneOf[1].properties))
        .toEqual(['enabled', 'externalsOnly', 'disableIdentifyingMaterial'])
      expect(Object.keys(schema.properties.matter.properties))
        .toEqual(['enabled', 'port', 'externalsOnly', 'disableIpv4'])
    })
  })
})

import type { ServiceType } from '@homebridge/hap-client'

import { describe, expect, it } from 'vitest'

import { nativeFavoriteServices, sharedThemeFavorites, THEME_CATALOG_UUID, THEME_FAVORITES_UUID, THEME_PICKER_UUID, THEME_SELECTION_UUID, themeActions, themeMetadata } from './theme-picker.model'

const group = 'c48b8a28-40d3-4f51-b51c-a5d39d985991'
function service(role: string, overrides: Record<string, unknown> = {}): ServiceType {
  return {
    type: role === 'source' ? 'Lightbulb' : 'Outlet',
    serviceName: 'Ocean',
    uniqueId: role,
    instance: { username: 'bridge-a' },
    serviceCharacteristics: [{ uuid: THEME_PICKER_UUID, value: JSON.stringify({ version: 1, group, role, id: 'a'.repeat(64) }) }, { uuid: 'on', type: 'On', perms: ['pr', 'pw'] }],
    ...overrides,
  } as unknown as ServiceType
}

describe('theme picker relationship', () => {
  it('does not depend on manufacturer, serial number, title uniqueness or catalog order', () => {
    const light = service('source', { accessoryInformation: { Manufacturer: 'Another Vendor' } })
    const first = service('action', { serviceName: 'Same name', uniqueId: 'first', accessoryInformation: {} })
    const second = service('action', { serviceName: 'Same name', uniqueId: 'second', accessoryInformation: { Manufacturer: 'Custom Plugin' } })
    second.serviceCharacteristics[0].value = JSON.stringify({ version: 1, group, role: 'action', id: 'b'.repeat(64) })
    const ids = themeActions(light, [light, second, first]).map(item => item.id)
    expect(ids).toEqual(['a'.repeat(64), 'b'.repeat(64)])
    expect(themeActions(light, [first, light, second]).map(item => item.id)).toEqual(ids)
    expect(themeActions(light, [light, { ...light, uniqueId: 'ambiguous-source' }, first])).toEqual([])
    expect(themeMetadata(service('source', { type: 'LockMechanism' }))).toBeUndefined()
    expect(themeMetadata(service('action', { serviceCharacteristics: [] }))).toBeUndefined()
  })

  it('uses stable IDs, retains renamed themes and separates bridges and lamps', () => {
    const light = service('source')
    const theme = service('action')
    const otherBridge = service('action', { instance: { username: 'bridge-b' } })
    expect(themeActions(light, [light, theme, otherBridge]).map(item => item.id)).toEqual(['a'.repeat(64)])
    expect(themeActions(light, [light, { ...theme, serviceName: 'Renamed Ocean' }])[0].id).toBe('a'.repeat(64))
    expect(themeActions(light, [light])).toEqual([])
    const otherLamp = service('action')
    otherLamp.serviceCharacteristics[0].value = JSON.stringify({ version: 1, group: group.replace('c48b', 'd48b'), role: 'action', id: 'a'.repeat(64) })
    expect(themeActions(light, [light, otherLamp])).toEqual([])
  })

  it('rejects ambiguous IDs, bad metadata and non-writable targets', () => {
    const light = service('source')
    expect(themeActions(light, [service('action'), service('action', { uniqueId: 'second' })])).toEqual([])
    expect(themeMetadata(service('action', { serviceCharacteristics: [{ uuid: THEME_PICKER_UUID, value: '{bad' }] }))).toBeUndefined()
    const readonly = service('action')
    readonly.serviceCharacteristics[1].perms = ['pr']
    expect(themeMetadata(readonly)).toBeUndefined()
    expect(themeMetadata(service('action', { type: 'LockMechanism' }))).toBeUndefined()
  })
})

describe('shared native favorites', () => {
  it('hides only favorites belonging to an unambiguous source on the same bridge', () => {
    const light = service('source')
    const favorite = service('favorite')
    const foreign = service('favorite', { instance: { username: 'bridge-b' } })
    expect(nativeFavoriteServices(light, [light, favorite, foreign, service('action')])).toEqual([favorite])
    expect(themeActions(light, [light, favorite])).toEqual([])
    expect(nativeFavoriteServices(light, [light, { ...light, uniqueId: 'duplicate' }, favorite])).toEqual([])
  })

  it('validates the shared capability and rejects malformed or duplicate favorites', () => {
    const light = service('source')
    const characteristic = { uuid: THEME_FAVORITES_UUID, format: 'data', perms: ['pr', 'pw'], value: '' }
    light.serviceCharacteristics.push(characteristic as never)
    const state = { version: 1, revision: 3, ids: ['a'.repeat(64)] }
    characteristic.value = btoa(JSON.stringify(state))
    expect(sharedThemeFavorites(light)).toEqual(state)
    for (const invalid of [{ ...state, revision: -1 }, { ...state, ids: [state.ids[0], state.ids[0]] }, { ...state, ids: ['invalid'] }]) {
      characteristic.value = btoa(JSON.stringify(invalid))
      expect(sharedThemeFavorites(light)).toBeUndefined()
    }
    characteristic.value = 'bad'
    expect(sharedThemeFavorites(light)).toBeUndefined()
    characteristic.value = btoa(JSON.stringify(state))
    characteristic.perms = ['pr']
    expect(sharedThemeFavorites(light)).toBeUndefined()
  })
})

it('reads an explicit catalog without exposing a switch for every theme', () => {
  const light = service('source')
  const item = { id: 'b'.repeat(64), name: 'Océan 火' }
  const encode = (value: unknown) => btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(value))))
  const catalog = { uuid: THEME_CATALOG_UUID, format: 'data', perms: ['pr'], value: encode({ version: 1, themes: [item] }) }
  light.serviceCharacteristics.push(catalog as never, { uuid: THEME_SELECTION_UUID, format: 'string', perms: ['pw'] } as never)
  expect(themeActions(light, [light])).toEqual([{ ...item, service: light, characteristicType: 'ThemeSelection' }])
  catalog.value = encode({ version: 1, themes: [item, item] })
  expect(themeActions(light, [light])).toEqual([])
  catalog.value = 'broken'
  expect(themeActions(light, [light])).toEqual([])
})

describe('independent UI rollout', () => {
  it('keeps existing lights and switches ordinary when the plugin has no theme capability', () => {
    const light = service('source', { serviceCharacteristics: [] })
    const outlet = service('action', { serviceCharacteristics: [] })
    expect(themeMetadata(light)).toBeUndefined()
    expect(themeActions(light, [light, outlet])).toEqual([])
    expect(nativeFavoriteServices(light, [light, outlet])).toEqual([])
  })

  it('does not hide native favorites when a catalog is missing, invalid, or from a newer protocol', () => {
    const light = service('source')
    const favorite = service('favorite')
    const services = [light, favorite]
    expect(nativeFavoriteServices(light, services)).toEqual([])
    const catalog = { uuid: THEME_CATALOG_UUID, format: 'data', perms: ['pr'], value: '' }
    light.serviceCharacteristics.push(catalog as never, { uuid: THEME_SELECTION_UUID, format: 'string', perms: ['pw'] } as never)
    for (const value of ['invalid', btoa(JSON.stringify({ version: 2, themes: [] }))]) {
      catalog.value = value
      expect(themeActions(light, services)).toEqual([])
      expect(nativeFavoriteServices(light, services)).toEqual([])
    }
    light.serviceCharacteristics[0].value = JSON.stringify({ version: 2, group, role: 'source' })
    expect(themeMetadata(light)).toBeUndefined()
    expect(nativeFavoriteServices(light, services)).toEqual([])
  })
})

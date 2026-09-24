import type { ServiceTypeX } from './accessories.interfaces'

import { TestBed } from '@angular/core/testing'
import { NgbModal } from '@ng-bootstrap/ng-bootstrap/modal'
import { TranslateService } from '@ngx-translate/core'
import { Subject } from 'rxjs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ApiService } from '@/app/core/communication/api.service'
import { SettingsService } from '@/app/core/ui/settings.service'
import { provideTestTranslate } from '@/testing/providers'

import en from '../../../i18n/en.json'
import { AccessoriesService } from './accessories.service'
import { ThemePickerComponent } from './theme-picker.component'
import { THEME_CATALOG_UUID, THEME_FAVORITES_UUID, THEME_PICKER_UUID, THEME_SELECTION_UUID } from './theme-picker.model'

const group = 'c48b8a28-40d3-4f51-b51c-a5d39d985991'
const id = 'a'.repeat(64)
function service(role: 'source' | 'action', bridge = 'bridge-a'): ServiceTypeX {
  return {
    type: role === 'source' ? 'Lightbulb' : 'Switch',
    uniqueId: `${bridge}/${role}`,
    serviceName: 'Same name',
    instance: { username: bridge },
    serviceCharacteristics: [
      { uuid: THEME_PICKER_UUID, value: JSON.stringify({ version: 1, group, role, id }) },
      { uuid: 'on', type: 'On', perms: ['pr', 'pw'] },
    ],
  } as unknown as ServiceTypeX
}

describe('theme picker commands and favorites', () => {
  let source: ServiceTypeX
  let action: ServiceTypeX
  let other: ServiceTypeX
  let accessories: any
  let api: { put: ReturnType<typeof vi.fn>, get: ReturnType<typeof vi.fn> }
  let component: ThemePickerComponent

  beforeEach(() => {
    source = service('source')
    action = service('action')
    other = service('source', 'bridge-b')
    const rooms = [{ name: 'Room', services: [source, other] }]
    accessories = {
      accessoryData: new Subject(),
      accessories: { services: [source, action, other, service('action', 'bridge-b')] },
      rooms: () => rooms,
      accessoryLayout: [{ name: 'Room', services: [{ ...source }, { ...other }] }],
      saveLayout: vi.fn((success: () => void) => success()),
    }
    api = { put: vi.fn().mockResolvedValue({}), get: vi.fn() }
    TestBed.configureTestingModule({
      imports: [ThemePickerComponent],
      providers: [
        provideTestTranslate(),
        { provide: AccessoriesService, useValue: accessories },
        { provide: ApiService, useValue: api },
        { provide: SettingsService, useValue: { actualLightingMode: 'light' } },
        { provide: NgbModal, useValue: { open: vi.fn() } },
      ],
    })
    TestBed.inject(TranslateService).setTranslation('en', en)
    const fixture = TestBed.createComponent(ThemePickerComponent)
    fixture.componentRef.setInput('service', source)
    fixture.detectChanges()
    component = fixture.componentInstance
  })

  afterEach(() => TestBed.resetTestingModule())

  it('sends catalog selections through the source lamp without a legacy theme switch', async () => {
    source.serviceCharacteristics.push(
      { uuid: THEME_CATALOG_UUID, format: 'data', perms: ['pr'], value: btoa(JSON.stringify({ version: 1, themes: [{ id, name: 'Fire' }] })) } as never,
      { uuid: THEME_SELECTION_UUID, format: 'string', perms: ['pw'] } as never,
    )
    accessories.accessoryData.next()
    await component.apply(component.actions[0])
    expect(api.put).toHaveBeenCalledExactlyOnceWith('/accessories/bridge-a%2Fsource', { characteristicType: 'ThemeSelection', value: id }, { timeout: 10000 })
    expect(component.lastSent).toBe('Fire')
  })

  it('targets only the chosen bridge, bounds waiting and blocks duplicate sends', async () => {
    let resolve!: () => void
    api.put.mockReturnValue(new Promise<void>((done) => {
      resolve = done
    }))
    const sending = component.apply(component.actions[0])
    await component.apply(component.actions[0])
    expect(api.put).toHaveBeenCalledExactlyOnceWith('/accessories/bridge-a%2Faction', { characteristicType: 'On', value: true }, { timeout: 10000 })
    expect(component.lastSent).toBe('')
    expect(component.busy).toBe(true)
    resolve()
    await sending
    expect(component.lastSent).toBe('Same name')
    expect(component.busy).toBe(false)
  })

  it('does not retry uncertain commands and permits deliberate recovery', async () => {
    api.put.mockRejectedValueOnce(new Error('timeout'))
    await component.apply(component.actions[0])
    expect(component.lastSent).toBe('')
    expect(component.error).toContain('did not confirm')
    expect(component.busy).toBe(false)
    expect(api.put).toHaveBeenCalledTimes(1)
    await component.apply(component.actions[0])
    expect(component.error).toBe('')
    expect(component.lastSent).toBe('Same name')
  })

  it('rechecks the current catalog before issuing a command', async () => {
    const stale = component.actions[0]
    accessories.accessories.services = [source, other]
    await component.apply(stale)
    expect(api.put).not.toHaveBeenCalled()
    expect(component.error).toContain('unavailable')
  })

  it('keeps saved favorites through a rename, disappearance and return', async () => {
    await component.toggleFavorite(component.actions[0])
    expect(source.themeFavorites).toEqual([id])
    expect(other.themeFavorites).toBeUndefined()
    expect(api.put).not.toHaveBeenCalled()
    action.serviceName = 'Renamed theme'
    accessories.accessoryData.next()
    expect(component.favoriteActions[0].name).toBe('Renamed theme')
    accessories.accessories.services = [source, other]
    accessories.accessoryData.next()
    expect(component.missingFavorites).toBe(1)
    expect(component.favorites).toEqual([id])
    accessories.accessories.services.push(action)
    accessories.accessoryData.next()
    expect(component.favoriteActions[0].id).toBe(id)
  })

  it('rolls back only the failed favorite edit without losing another accessory edit', async () => {
    accessories.saveLayout.mockImplementation((_success: () => void, failure: () => void) => {
      accessories.accessoryLayout[0].services[1].themeFavorites = ['b'.repeat(64)]
      failure()
    })
    await component.toggleFavorite(component.actions[0])
    expect(source.themeFavorites).toBeUndefined()
    expect(component.favorites).toEqual([])
    expect(accessories.accessoryLayout[0].services[1].themeFavorites).toEqual(['b'.repeat(64)])
    expect(component.error).toContain('could not be saved')
    expect(component.busy).toBe(false)
    expect(api.put).not.toHaveBeenCalled()
  })

  it('tolerates malformed stored favorites without changing the catalog', () => {
    source.themeFavorites = [null, 42, id, id, 'invalid'] as unknown as string[]
    accessories.accessoryData.next()
    expect(component.favorites).toEqual([id])
    source.themeFavorites = {} as string[]
    accessories.accessoryData.next()
    expect(component.favorites).toEqual([])
    expect(component.actions).toHaveLength(1)
  })

  function sharedService(revision: number, ids: string[]) {
    return { ...source, serviceCharacteristics: [...source.serviceCharacteristics.filter(c => c.uuid !== THEME_FAVORITES_UUID), {
      uuid: THEME_FAVORITES_UUID,
      type: 'ThemeFavorites',
      format: 'data',
      perms: ['pr', 'pw', 'ev'],
      value: btoa(JSON.stringify({ version: 1, revision, ids })),
    }] } as ServiceTypeX
  }

  it('saves shared HomeKit favorites through the lamp instead of private layout', async () => {
    source.serviceCharacteristics = sharedService(0, []).serviceCharacteristics
    accessories.accessoryData.next()
    api.get.mockResolvedValue(sharedService(0, []))
    api.put.mockResolvedValue(sharedService(1, [id]))
    await component.toggleFavorite(component.actions[0])
    expect(component.favorites).toEqual([id])
    expect(accessories.saveLayout).not.toHaveBeenCalled()
    expect(api.put).toHaveBeenCalledExactlyOnceWith('/accessories/bridge-a%2Fsource', {
      characteristicType: 'ThemeFavorites',
      value: btoa(JSON.stringify({ version: 1, revision: 0, ids: [id] })),
    }, { timeout: 10000 })
    accessories.accessoryData.next()
    expect(component.favorites).toEqual([id])
  })

  it('reconciles a committed save after a lost response without repeating the write', async () => {
    source.serviceCharacteristics = sharedService(0, []).serviceCharacteristics
    accessories.accessoryData.next()
    api.get.mockResolvedValueOnce(sharedService(0, [])).mockResolvedValueOnce(sharedService(1, [id]))
    api.put.mockRejectedValueOnce(new Error('response lost'))
    await component.toggleFavorite(component.actions[0])
    expect(component.favorites).toEqual([id])
    expect(component.error).toBe('')
    expect(api.put).toHaveBeenCalledTimes(1)
    expect(component.busy).toBe(false)
  })

  it('does not write shared favorites while the saved state is unreadable', async () => {
    source.serviceCharacteristics = sharedService(0, []).serviceCharacteristics
    accessories.accessoryData.next()
    api.get.mockRejectedValue(new Error('offline'))
    await component.toggleFavorite(component.actions[0])
    expect(api.put).not.toHaveBeenCalled()
    expect(accessories.saveLayout).not.toHaveBeenCalled()
    expect(component.error).toContain('did not confirm')
  })

  it('rejects a 100th shared favorite without a write and lets the user remove one', async () => {
    const ids = Array.from({ length: 99 }, (_, i) => i.toString(16).padStart(64, '0'))
    source.serviceCharacteristics = sharedService(3, ids).serviceCharacteristics
    accessories.accessoryData.next()
    api.get.mockResolvedValue(sharedService(3, ids))
    await component.toggleFavorite(component.actions[0])
    expect(api.put).not.toHaveBeenCalled()
    expect(component.favorites).toEqual(ids)
    expect(component.error).toContain('99 favorites')
    expect(component.busy).toBe(false)
    api.put.mockResolvedValue(sharedService(4, ids.slice(1)))
    await component.toggleFavorite({ ...component.actions[0], id: ids[0] })
    expect(component.favorites).toEqual(ids.slice(1))
    expect(api.put).toHaveBeenCalledTimes(1)
  })
})

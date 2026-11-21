import type { AccessoryLayout, AccessoryLayoutService, ServiceTypeX } from '@/app/core/accessories/accessories.interfaces'
import type { FakeCache, FakeIoNamespace, FakeModalService, FakeToastr, FakeWs } from '@/testing'
import type { ServiceType } from '@homebridge/hap-client'

import { TestBed } from '@angular/core/testing'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { AccessoriesService } from '@/app/core/accessories/accessories.service'
import { AccessoryInfoComponent } from '@/app/core/accessories/accessory-info/accessory-info.component'
import { DEFAULT_FILTER_STATE } from '@/app/core/accessories/filters/accessory-filters'
import { AuthService } from '@/app/core/auth/auth.service'
import { CachedAccessoriesCacheService } from '@/app/core/caching/cached-accessories-cache.service'
import { ServerPairingsCacheService } from '@/app/core/caching/server-pairings-cache.service'
import { ACCESSORY_INFO_MODAL_DATA } from '@/app/core/modal-data-tokens'
import { cachedAccessoriesStub, cacheStub, fakeWs, makeAuth, modalServiceSpy, toastrStub } from '@/testing'
import { provideFakes, provideTestTranslate } from '@/testing/providers'

const BRIDGE_A = '0E:AA:AA:AA:AA:AA'
const BRIDGE_B = '0E:BB:BB:BB:BB:BB'

/**
 * AccessoriesService is the single largest piece of state in the UI: it owns
 * the socket session, the room layout, the merge between what the server
 * discovered and what the user arranged, and the control helpers every
 * accessory component calls.
 *
 * The service is deliberately exercised through its real inputs - a socket
 * event carrying raw services - rather than by poking private methods, because
 * almost every bug in this area has been an ordering bug between the six steps
 * the `accessories-data` handler runs.
 *
 * ⚠️ The shared `hapService()` / `matterService()` fixtures already carry
 * `getCharacteristic` / `getCluster`, which is what this service is supposed to
 * attach. Using them here would skip `generateHelpers` entirely, so the raw
 * payload builders below are local on purpose.
 */
describe('AccessoriesService', () => {
  let ws: FakeWs
  let io: FakeIoNamespace
  let toastr: FakeToastr
  let modal: FakeModalService
  let accessoryCache: ReturnType<typeof cachedAccessoriesStub>
  let pairingCache: FakeCache<any[]>
  let service: AccessoriesService

  interface CreateOptions {
    /** The layout the server returns from `get-layout`. */
    layout?: AccessoryLayout
    admin?: boolean
    /** Whether the namespace is already connected. Defaults to true. */
    connected?: boolean
    hapCacheValue?: any[]
    pairingCacheValue?: any[]
    hapCacheError?: unknown
    pairingCacheError?: unknown
    /** The reply to `get-views`. Defaults to an empty set. null makes the load fail. */
    views?: any
  }

  /** A raw HAP characteristic, as the socket delivers it - no `setValue` yet. */
  function rawCharacteristic(type: string, value: any, iid: number) {
    return {
      aid: 1,
      iid,
      uuid: `0000-${type}`,
      type,
      value,
      format: 'bool',
      perms: ['pr', 'pw', 'ev'],
    }
  }

  /** A raw HAP service, as the socket delivers it - no `getCharacteristic` yet. */
  function rawHap(overrides: Record<string, any> = {}): ServiceType {
    const type = overrides.type ?? 'Switch'
    return {
      aid: 1,
      iid: 10,
      uuid: `0000-${type}`,
      type,
      humanType: type,
      serviceName: 'Test Switch',
      serviceCharacteristics: [
        rawCharacteristic('On', false, 11),
      ],
      accessoryInformation: {
        'Name': 'Test Switch',
        'Serial Number': 'SERIAL-1',
        'Manufacturer': 'Test Manufacturer',
        'Model': 'Test Model',
      },
      instance: { name: 'Bridge A', username: BRIDGE_A },
      values: {},
      uniqueId: 'hap-1',
      ...overrides,
    } as unknown as ServiceType
  }

  /** A raw Matter service, as the socket delivers it - no `getCluster` yet. */
  function rawMatter(overrides: Record<string, any> = {}): ServiceType {
    const deviceType = overrides.deviceType ?? 'onOffLight'
    return {
      aid: 1,
      iid: 10,
      uuid: 'matter-uuid',
      type: deviceType,
      humanType: deviceType,
      protocol: 'matter',
      deviceType,
      serviceName: 'Test Matter Light',
      serviceCharacteristics: [],
      accessoryInformation: {
        'Name': 'Test Matter Light',
        'Serial Number': 'MATTER-SERIAL-1',
      },
      instance: { name: 'Matter Bridge', username: BRIDGE_B },
      values: {},
      clusters: {
        onOff: { onOff: false },
      },
      uniqueId: 'matter:light-1',
      ...overrides,
    } as unknown as ServiceType
  }

  /** One entry in a saved room layout. */
  function layoutEntry(overrides: Partial<AccessoryLayoutService> = {}): AccessoryLayoutService {
    return {
      uniqueId: 'hap-1',
      aid: 1,
      iid: 10,
      uuid: '0000-Switch',
      name: 'Test Switch',
      serial: 'SERIAL-1',
      bridge: BRIDGE_A,
      ...overrides,
    }
  }

  function create(options: CreateOptions = {}) {
    // A spec wanting a different layout or a failing cache rebuilds the
    // TestBed, so the module from the default beforeEach has to go first
    TestBed.resetTestingModule()

    ws = fakeWs()
    io = ws.namespace('accessories', { connected: options.connected ?? true })

    // Deep-cloned per call: `loadLayout` mutates the layout it is handed
    // (stamping `isDefault`) and keeps a second clone as the original
    const layout = options.layout ?? []
    io.socket.respondTo('get-layout', () => JSON.parse(JSON.stringify(layout)))
    io.socket.respondTo('save-layout', () => ({ ok: true }))
    const views = options.views === undefined
      ? { views: [], labels: {}, floors: [] }
      : options.views
    io.socket.respondTo('get-views', () => JSON.parse(JSON.stringify(views)))
    io.socket.respondTo('save-views', () => ({ ok: true }))

    toastr = toastrStub()
    modal = modalServiceSpy()
    accessoryCache = cachedAccessoriesStub(options.hapCacheValue ?? [])
    pairingCache = cacheStub<any[]>(options.pairingCacheValue ?? [])

    if (options.hapCacheError !== undefined) {
      accessoryCache.getHap = vi.fn(async (): Promise<any[]> => {
        throw options.hapCacheError
      })
    }
    if (options.pairingCacheError !== undefined) {
      pairingCache.get = vi.fn(async (): Promise<any[]> => {
        throw options.pairingCacheError
      })
    }

    TestBed.configureTestingModule({
      providers: [
        provideTestTranslate(),
        provideFakes({ ws, toastr, modal }),
        {
          provide: AuthService,
          useValue: makeAuth({
            user: { admin: options.admin ?? true, username: 'admin' },
          }),
        },
        { provide: CachedAccessoriesCacheService, useValue: accessoryCache },
        { provide: ServerPairingsCacheService, useValue: pairingCache },
      ],
    })

    service = TestBed.inject(AccessoriesService)
    return service
  }

  /** Create the service and open a session. */
  async function start(options: CreateOptions = {}) {
    create(options)
    await service.start()
    return service
  }

  /** Deliver an `accessories-data` payload the way the server does. */
  function sendData(...services: ServiceType[]) {
    io.socket.fire('accessories-data', services)
  }

  function room(name: string) {
    return service.rooms().find(entry => entry.name === name)
  }

  function idsIn(name: string) {
    return (room(name)?.services ?? []).map(entry => entry.uniqueId)
  }

  /**
   * Invoke the HAP helper the service under test attached. Deliberately not
   * null-guarded: if `generateHelpers` failed to attach anything at all, this
   * should throw rather than quietly look like "the accessory has no such
   * characteristic".
   */
  function charFor(target: ServiceType, type: string): any {
    return (target.getCharacteristic as any)(type)
  }

  /** Every room a service ended up in, by name. */
  function roomsHolding(uniqueId: string) {
    return service.rooms()
      .filter(entry => entry.services.some(candidate => candidate.uniqueId === uniqueId))
      .map(entry => entry.name)
  }

  /**
   * `loadCachedData` and `saveLayout` both settle over a promise chain rather
   * than a timer, so flush microtasks - a fake timer would not advance them.
   */
  async function settle() {
    for (let tick = 0; tick < 10; tick += 1) {
      await Promise.resolve()
    }
  }

  beforeEach(() => {
    // ⚠️ spyOn on an already-spied method hands back the SAME spy, so its call
    // list survives into the next test unless it is cleared here
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.mocked(console.error).mockClear()
    vi.mocked(console.warn).mockClear()
    create()
  })

  describe('cached data for the accessory information modal', () => {
    it('loads both caches for an admin', async () => {
      create({ admin: true })
      await settle()

      expect(accessoryCache.getHap).toHaveBeenCalled()
      expect(pairingCache.get).toHaveBeenCalled()
    })

    it('loads neither cache for a non-admin', async () => {
      create({ admin: false })
      await settle()

      expect(accessoryCache.getHap).not.toHaveBeenCalled()
      expect(pairingCache.get).not.toHaveBeenCalled()
    })

    it('warns once when both caches fail, not once each', async () => {
      create({
        hapCacheError: new Error('hap down'),
        pairingCacheError: new Error('pairings down'),
      })
      await settle()

      expect(toastr.warning).toHaveBeenCalledTimes(1)
      expect(toastr.shown[0].title).toBe('toast.title_warning')
    })

    it('still loads the pairing cache when the accessory cache fails', async () => {
      create({
        hapCacheError: new Error('hap down'),
        pairingCacheValue: [
          { _id: 'pairing' },
        ],
      })
      await settle()

      expect(pairingCache.get).toHaveBeenCalled()
      expect(toastr.warning).toHaveBeenCalledTimes(1)
    })

    it('surfaces a server-supplied message rather than the generic one', async () => {
      create({
        hapCacheError: {
          error: { message: 'Cached accessories unavailable' },
        },
      })
      await settle()

      expect(toastr.shown[0].message).toBe('Cached accessories unavailable')
    })

    it('hands both caches to the modal', async () => {
      await start({
        hapCacheValue: [
          { aid: 1 },
        ],
        pairingCacheValue: [
          { _id: 'pairing' },
        ],
      })
      await settle()
      sendData(rawHap())

      void service.showAccessoryInformation(service.rooms()[0].services[0])
      await settle()

      const data = modal.dataFor(ACCESSORY_INFO_MODAL_DATA)
      expect(data?.accessoryCache).toEqual([
        { aid: 1 },
      ])
      expect(data?.pairingCache).toEqual([
        { _id: 'pairing' },
      ])
    })
  })

  describe('starting a session', () => {
    it('connects to the accessories namespace and asks for the accessories', async () => {
      await start()

      expect(ws.connectToNamespace).toHaveBeenCalledWith('accessories')
      expect(io.socket.payloadsFor('get-accessories')).toHaveLength(1)
    })

    it('asks again on every reconnection', async () => {
      await start({ connected: false })
      expect(io.socket.payloadsFor('get-accessories')).toHaveLength(0)

      io.markConnected()
      io.connected.next()

      expect(io.socket.payloadsFor('get-accessories')).toHaveLength(2)
    })

    it('starts with neither protocol ready for control', async () => {
      await start()

      expect(service.hapReadyForControl).toBe(false)
      expect(service.matterReadyForControl).toBe(false)
    })

    it('marks each protocol ready only on its own event', async () => {
      await start()

      io.socket.fire('hap-accessories-ready-for-control')
      expect(service.hapReadyForControl).toBe(true)
      expect(service.matterReadyForControl).toBe(false)

      io.socket.fire('matter-accessories-ready-for-control')
      expect(service.matterReadyForControl).toBe(true)
    })

    it('shows the server message on a control failure', async () => {
      await start()

      io.socket.fire('accessory-control-failure', 'Accessory did not respond')

      expect(toastr.error).toHaveBeenCalledWith('Accessory did not respond', 'toast.title_error')
    })

    it('refreshes over the open socket when a new instance is discovered', async () => {
      await start()

      io.socket.fire('accessories-reload-required')

      expect(io.socket.payloadsFor('accessory-control')).toEqual([
        { refresh: true },
      ])
      // A full stop()/start() would re-bind every handler on the cached socket,
      // doubling the live listeners on each reload
      expect(ws.connectToNamespace).toHaveBeenCalledTimes(1)
      expect(io.socket.handlers('accessories-data')).toHaveLength(1)
    })

    it('drops the matter ready flag when only matter reloads', async () => {
      await start()
      io.socket.fire('matter-accessories-ready-for-control')
      io.socket.fire('hap-accessories-ready-for-control')

      io.socket.fire('matter-accessories-reload-required')

      expect(service.matterReadyForControl).toBe(false)
      expect(service.hapReadyForControl).toBe(true)
      expect(io.socket.payloadsFor('accessory-control')).toEqual([
        { refresh: true },
      ])
    })
  })

  describe('loading the room layout', () => {
    it('asks for the layout for the signed-in user', async () => {
      await start()

      expect(io.requests[0]).toEqual({
        resource: 'get-layout',
        payload: { user: 'admin' },
      })
    })

    it('builds an empty room per saved room, in order', async () => {
      await start({
        layout: [
          { name: 'Kitchen', isDefault: true, services: [] },
          { name: 'Hallway', services: [] },
        ],
      })

      expect(service.rooms().map(entry => entry.name)).toEqual(['Kitchen', 'Hallway'])
      expect(service.rooms().every(entry => entry.services.length === 0)).toBe(true)
    })

    it('promotes a room literally named Default Room when no room is flagged', async () => {
      await start({
        layout: [
          { name: 'Kitchen', services: [] },
          { name: 'Default Room', services: [] },
        ],
      })

      expect(room('Default Room')?.isDefault).toBe(true)
      expect(room('Kitchen')?.isDefault).toBeUndefined()
    })

    it('promotes the first room when nothing is flagged and there is no Default Room', async () => {
      await start({
        layout: [
          { name: 'Kitchen', services: [] },
          { name: 'Hallway', services: [] },
        ],
      })

      expect(room('Kitchen')?.isDefault).toBe(true)
      expect(room('Hallway')?.isDefault).toBeUndefined()
    })

    it('leaves an existing default room alone', async () => {
      await start({
        layout: [
          { name: 'Kitchen', services: [] },
          { name: 'Hallway', isDefault: true, services: [] },
        ],
      })

      expect(room('Hallway')?.isDefault).toBe(true)
      expect(room('Kitchen')?.isDefault).toBeUndefined()
    })
  })

  describe('sorting services into rooms', () => {
    it('puts a service back in the room it was saved in', async () => {
      await start({
        layout: [
          { name: 'Kitchen', isDefault: true, services: [] },
          {
            name: 'Hallway',
            services: [
              layoutEntry(),
            ],
          },
        ],
      })

      sendData(rawHap())

      expect(idsIn('Hallway')).toEqual(['hap-1'])
      expect(idsIn('Kitchen')).toEqual([])
    })

    it('puts an unrecognised service in the default room', async () => {
      await start({
        layout: [
          { name: 'Kitchen', services: [] },
          { name: 'Hallway', isDefault: true, services: [] },
        ],
      })

      sendData(rawHap())

      expect(idsIn('Hallway')).toEqual(['hap-1'])
    })

    it('creates a Default Room when the layout is empty', async () => {
      await start({ layout: [] })

      sendData(rawHap())

      expect(service.rooms()).toHaveLength(1)
      expect(service.rooms()[0].name).toBe('Default Room')
      expect(service.rooms()[0].isDefault).toBe(true)
      expect(idsIn('Default Room')).toEqual(['hap-1'])
    })

    it('never puts one service in two rooms', async () => {
      await start({
        layout: [
          { name: 'Kitchen', isDefault: true, services: [] },
          {
            name: 'Hallway',
            services: [
              layoutEntry(),
            ],
          },
        ],
      })

      sendData(rawHap())
      sendData(rawHap())
      sendData(rawHap())

      expect(roomsHolding('hap-1')).toEqual(['Hallway'])
    })

    it('applies the saved custom name, type, hidden and dashboard flags', async () => {
      await start({
        layout: [
          {
            name: 'Kitchen',
            isDefault: true,
            services: [
              layoutEntry({
                customName: 'Kettle',
                customType: 'Outlet',
                hidden: true,
                onDashboard: true,
              }),
            ],
          },
        ],
      })

      sendData(rawHap())

      const saved = room('Kitchen')!.services[0]
      expect(saved.customName).toBe('Kettle')
      expect(saved.customType).toBe('Outlet')
      expect(saved.hidden).toBe(true)
      expect(saved.onDashboard).toBe(true)
    })

    it('re-applies the custom attributes to the replacement object on the next event', async () => {
      // parseServices swaps in the new payload object for zoneless change
      // detection, so the attributes have to be re-applied - otherwise the
      // custom icon reverts on the first live status update
      await start({
        layout: [
          {
            name: 'Kitchen',
            isDefault: true,
            services: [
              layoutEntry({ customType: 'Outlet' }),
            ],
          },
        ],
      })

      sendData(rawHap())
      const second = rawHap({
        values: { On: true },
      })
      sendData(second)

      const current = room('Kitchen')!.services[0]
      expect(current).toBe(second)
      expect((current as ServiceTypeX).customType).toBe('Outlet')
    })

    it('points the room at the newest service object', async () => {
      await start({
        layout: [
          { name: 'Kitchen', isDefault: true, services: [] },
        ],
      })

      const first = rawHap()
      sendData(first)
      const second = rawHap()
      sendData(second)

      expect(room('Kitchen')!.services[0]).toBe(second)
      expect(room('Kitchen')!.services[0]).not.toBe(first)
    })

    it('merges a late-discovered bridge into the existing rooms', async () => {
      await start({
        layout: [
          { name: 'Kitchen', isDefault: true, services: [] },
        ],
      })

      sendData(rawHap())
      sendData(rawHap(), rawHap({
        uniqueId: 'hap-2',
        serviceName: 'Late Switch',
        instance: { name: 'Bridge B', username: BRIDGE_B },
      }))

      expect(idsIn('Kitchen')).toEqual(['hap-1', 'hap-2'])
    })

    it('links services listed in `linked` to their siblings', async () => {
      await start()

      const television = rawHap({
        uniqueId: 'hap-tv',
        type: 'Television',
        iid: 20,
        linked: [21],
      })
      const speaker = rawHap({ uniqueId: 'hap-speaker', type: 'TelevisionSpeaker', iid: 21 })
      sendData(television, speaker)

      expect((television as any).linkedServices[21]).toBe(speaker)
    })
  })

  describe('matching a discovered service to the saved layout', () => {
    async function withLayout(saved: AccessoryLayoutService) {
      await start({
        layout: [
          { name: 'Kitchen', isDefault: true, services: [] },
          {
            name: 'Hallway',
            services: [saved],
          },
        ],
      })
    }

    it('keeps same-named outlets on different plugs separate through discovery and save', async () => {
      const plugs = ['PLUG-A', 'PLUG-B'].map((serial, index) => layoutEntry({
        uniqueId: `plug-${index}`,
        serial,
        nameBasedUniqueId: 'shared-outlet-name',
        customName: `Custom ${index}`,
      }))
      await start({
        layout: [
          { name: 'Kitchen', isDefault: true, services: plugs },
        ],
      })
      sendData(...plugs.map(plug => rawHap({
        uniqueId: plug.uniqueId,
        nameBasedUniqueId: plug.nameBasedUniqueId,
        accessoryInformation: { 'Serial Number': plug.serial },
      })))
      expect(service.rooms()[0].services.map(s => s.customName)).toEqual(['Custom 0', 'Custom 1'])
      await service.saveLayout()
      const saved = io.requests.find(entry => entry.resource === 'save-layout')!.payload.layout[0].services
      expect(saved.map((s: AccessoryLayoutService) => s.customName)).toEqual(['Custom 0', 'Custom 1'])
    })

    it('preserves an offline plug when an online plug shares its name-based id', async () => {
      const plugs = ['PLUG-A', 'PLUG-B'].map((serial, index) => layoutEntry({
        uniqueId: `plug-${index}`,
        serial,
        nameBasedUniqueId: 'shared-outlet-name',
        customName: `Custom ${index}`,
      }))
      await start({
        layout: [
          { name: 'Kitchen', isDefault: true, services: plugs },
        ],
      })
      sendData(rawHap({
        uniqueId: 'plug-0',
        nameBasedUniqueId: 'shared-outlet-name',
        accessoryInformation: { 'Serial Number': 'PLUG-A' },
      }))
      await service.saveLayout()
      const saved = io.requests.find(entry => entry.resource === 'save-layout')!.payload.layout[0].services
      expect(saved.map((s: AccessoryLayoutService) => s.customName)).toEqual(['Custom 0', 'Custom 1'])
    })

    it('keeps the default serial number from merging same-named outlets on different plugs', async () => {
      const plugs = [0, 1].map(index => layoutEntry({
        uniqueId: `plug-${index}`,
        serial: 'Default-SerialNumber',
        nameBasedUniqueId: 'shared-outlet-name',
        customName: `Custom ${index}`,
      }))
      await start({
        layout: [
          { name: 'Kitchen', isDefault: true, services: plugs },
        ],
      })

      // The second plug arrives first, so a first-match search would hand it plug 0's name
      sendData(rawHap({
        uniqueId: 'plug-1',
        nameBasedUniqueId: 'shared-outlet-name',
        accessoryInformation: { 'Serial Number': 'Default-SerialNumber' },
      }))
      await service.saveLayout()

      const saved = io.requests.find(entry => entry.resource === 'save-layout')!.payload.layout[0].services
      expect(saved.map((s: AccessoryLayoutService) => [s.uniqueId, s.customName])).toEqual([
        ['plug-1', 'Custom 1'],
        ['plug-0', 'Custom 0'],
      ])
    })

    it('matches a lone saved entry by name across a restart when there is no serial number', async () => {
      await withLayout(layoutEntry({ uniqueId: 'old', serial: '', nameBasedUniqueId: 'same-name' }))
      sendData(rawHap({ uniqueId: 'new', nameBasedUniqueId: 'same-name', accessoryInformation: {} }))
      expect(idsIn('Hallway')).toEqual(['new'])
    })

    it('treats a changed serial number as a different device, even with the same uniqueId', async () => {
      await withLayout(layoutEntry({ uniqueId: 'hap-1', serial: 'PLUG-A', nameBasedUniqueId: 'nb-1' }))
      sendData(rawHap({
        uniqueId: 'hap-1',
        nameBasedUniqueId: 'nb-1',
        accessoryInformation: { 'Serial Number': 'PLUG-B' },
      }))
      expect(idsIn('Hallway')).toEqual([])
      expect(idsIn('Kitchen')).toEqual(['hap-1'])
    })

    it('treats a changed serial number as a different device for a legacy entry', async () => {
      await withLayout(layoutEntry({ uniqueId: 'hap-1', serial: 'PLUG-A' }))
      sendData(rawHap({
        uniqueId: 'hap-1',
        accessoryInformation: { 'Serial Number': 'PLUG-B' },
      }))
      expect(idsIn('Hallway')).toEqual([])
    })

    it('does not give a saved outlet to a same-named outlet on a different serial', async () => {
      await withLayout(layoutEntry({ uniqueId: 'plug-0', serial: 'PLUG-A', nameBasedUniqueId: 'shared-outlet-name' }))
      sendData(rawHap({
        uniqueId: 'plug-1',
        nameBasedUniqueId: 'shared-outlet-name',
        accessoryInformation: { 'Serial Number': 'PLUG-B' },
      }))
      expect(idsIn('Hallway')).toEqual([])
    })

    it('gives one saved entry to only one discovered service', async () => {
      await withLayout(layoutEntry({ uniqueId: 'ancient-id', customName: 'Lamp' }))
      sendData(rawHap({ uniqueId: 'fresh-1' }), rawHap({ uniqueId: 'fresh-2', iid: 20 }))
      expect(idsIn('Hallway')).toEqual(['fresh-1'])
      expect(idsIn('Kitchen')).toEqual(['fresh-2'])
      expect((room('Kitchen')!.services[0] as ServiceTypeX).customName).toBeUndefined()
    })

    it('prefers nameBasedUniqueId over a changed uniqueId', async () => {
      // uniqueId is only stable within a session, so a restarted child bridge
      // hands back a different one for the same accessory
      await withLayout(layoutEntry({ uniqueId: 'stale-id', nameBasedUniqueId: 'nb-1' }))

      sendData(rawHap({ uniqueId: 'fresh-id', nameBasedUniqueId: 'nb-1' }))

      expect(idsIn('Hallway')).toEqual(['fresh-id'])
    })

    it('does not fall back to uniqueId when both sides have a nameBasedUniqueId', async () => {
      // Once both sides carry the stable id, a mismatch means a different
      // accessory - even if the session-scoped uniqueId happens to collide
      await withLayout(layoutEntry({ uniqueId: 'hap-1', nameBasedUniqueId: 'nb-1' }))

      sendData(rawHap({ uniqueId: 'hap-1', nameBasedUniqueId: 'nb-2' }))

      expect(idsIn('Hallway')).toEqual([])
      expect(idsIn('Kitchen')).toEqual(['hap-1'])
    })

    it('matches on uniqueId when neither side has a nameBasedUniqueId', async () => {
      await withLayout(layoutEntry({ uniqueId: 'hap-1' }))

      sendData(rawHap({ uniqueId: 'hap-1', serviceName: 'Renamed Switch' }))

      expect(idsIn('Hallway')).toEqual(['hap-1'])
    })

    it('falls back to name, serial, bridge and uuid for a legacy layout', async () => {
      await withLayout(layoutEntry({ uniqueId: 'ancient-id' }))

      sendData(rawHap({ uniqueId: 'fresh-id' }))

      expect(idsIn('Hallway')).toEqual(['fresh-id'])
    })

    it('rejects the legacy fallback when the bridge differs', async () => {
      await withLayout(layoutEntry({ uniqueId: 'ancient-id', bridge: BRIDGE_A }))

      sendData(rawHap({
        uniqueId: 'fresh-id',
        instance: { name: 'Bridge B', username: BRIDGE_B },
      }))

      expect(idsIn('Hallway')).toEqual([])
      expect(idsIn('Kitchen')).toEqual(['fresh-id'])
    })

    it('matches a matter accessory on uniqueId and bridge only', async () => {
      await withLayout({
        uniqueId: 'matter:light-1',
        aid: 1,
        iid: 10,
        uuid: 'something-else-entirely',
        name: 'Renamed In The App',
        serial: 'A-DIFFERENT-SERIAL',
        bridge: BRIDGE_B,
      })

      sendData(rawMatter())

      expect(idsIn('Hallway')).toEqual(['matter:light-1'])
    })

    it('will not match a matter accessory that moved bridge', async () => {
      await withLayout({
        uniqueId: 'matter:light-1',
        aid: 1,
        iid: 10,
        uuid: 'matter-uuid',
        name: 'Test Matter Light',
        serial: 'MATTER-SERIAL-1',
        bridge: BRIDGE_A,
        nameBasedUniqueId: 'nb-matter',
      })

      sendData(rawMatter({ nameBasedUniqueId: 'nb-matter' }))

      expect(idsIn('Hallway')).toEqual([])
      expect(idsIn('Kitchen')).toEqual(['matter:light-1'])
    })

    it('ignores saved entries with no name', async () => {
      // A half-written layout entry must not swallow every discovered service
      await withLayout({ uniqueId: 'hap-1' } as AccessoryLayoutService)

      sendData(rawHap())

      expect(idsIn('Hallway')).toEqual([])
      expect(idsIn('Kitchen')).toEqual(['hap-1'])
    })
  })

  describe('ordering the services inside a room', () => {
    it('follows the saved order, not the order the services arrived in', async () => {
      await start({
        layout: [
          {
            name: 'Kitchen',
            isDefault: true,
            services: [
              layoutEntry({ uniqueId: 'hap-3', name: 'Third', uuid: 'uuid-3' }),
              layoutEntry({ uniqueId: 'hap-1', name: 'First', uuid: 'uuid-1' }),
              layoutEntry({ uniqueId: 'hap-2', name: 'Second', uuid: 'uuid-2' }),
            ],
          },
        ],
      })

      sendData(
        rawHap({ uniqueId: 'hap-1', serviceName: 'First', uuid: 'uuid-1' }),
        rawHap({ uniqueId: 'hap-2', serviceName: 'Second', uuid: 'uuid-2' }),
        rawHap({ uniqueId: 'hap-3', serviceName: 'Third', uuid: 'uuid-3' }),
      )

      expect(idsIn('Kitchen')).toEqual(['hap-3', 'hap-1', 'hap-2'])
    })

    it('leaves a room the layout no longer describes untouched', async () => {
      await start({
        layout: [
          { name: 'Kitchen', isDefault: true, services: [] },
        ],
      })

      sendData(rawHap({ uniqueId: 'hap-1' }), rawHap({ uniqueId: 'hap-2', uuid: 'uuid-2' }))

      // Nothing is saved for these two, so they keep their arrival order
      expect(idsIn('Kitchen')).toEqual(['hap-1', 'hap-2'])
    })
  })

  describe('services that never appear in a room', () => {
    it.each([
      'InputSource',
      'LockManagement',
      'CameraRTPStreamManagement',
      'ProtocolInformation',
      'NFCAccess',
      'BridgedNode',
      'History',
    ])('hides a %s service', async (type) => {
      await start()

      sendData(rawHap({ uniqueId: 'visible' }), rawHap({ uniqueId: 'hidden-one', type, uuid: `0000-${type}` }))

      expect(roomsHolding('hidden-one')).toEqual([])
      expect(roomsHolding('visible')).toHaveLength(1)
    })

    it('hides a matter accessory by its device type', async () => {
      // Matter services carry `deviceType` rather than `type`, so the hidden
      // list is checked against both
      await start()

      sendData(rawMatter({ uniqueId: 'matter:bridge', deviceType: 'BridgedNode', type: 'BridgedNode' }))

      expect(roomsHolding('matter:bridge')).toEqual([])
    })
  })

  describe('combining related services', () => {
    function accessory(name: string, serial: string, type: string, uniqueId: string, iid: number) {
      return rawHap({
        type,
        uniqueId,
        iid,
        serviceName: name,
        uuid: `0000-${type}`,
        accessoryInformation: { 'Name': name, 'Serial Number': serial },
      })
    }

    it('folds a lone fan into a heater cooler on the same accessory', async () => {
      await start()

      const heaterCooler = accessory('Aircon', 'AC-1', 'HeaterCooler', 'hap-hc', 10)
      const fan = accessory('Aircon', 'AC-1', 'Fanv2', 'hap-fan', 11)
      sendData(heaterCooler, fan)

      expect((heaterCooler as any).linkedServices[11]).toBe(fan)
      expect(roomsHolding('hap-fan')).toEqual([])
      expect(roomsHolding('hap-hc')).toHaveLength(1)
    })

    it('folds a lone fan into a humidifier on the same accessory', async () => {
      await start()

      const humidifier = accessory('Humidifier', 'HU-1', 'HumidifierDehumidifier', 'hap-hd', 10)
      const fan = accessory('Humidifier', 'HU-1', 'Fan', 'hap-fan', 11)
      sendData(humidifier, fan)

      expect((humidifier as any).linkedServices[11]).toBe(fan)
      expect(roomsHolding('hap-fan')).toEqual([])
    })

    it('leaves two fans alone - it cannot tell which one belongs to the unit', async () => {
      await start()

      const heaterCooler = accessory('Aircon', 'AC-1', 'HeaterCooler', 'hap-hc', 10)
      const first = accessory('Aircon', 'AC-1', 'Fanv2', 'hap-fan-1', 11)
      const second = accessory('Aircon', 'AC-1', 'Fanv2', 'hap-fan-2', 12)
      sendData(heaterCooler, first, second)

      expect((heaterCooler as any).linkedServices).toBeUndefined()
      expect(roomsHolding('hap-fan-1')).toHaveLength(1)
      expect(roomsHolding('hap-fan-2')).toHaveLength(1)
    })

    it('does not fold a fan from a different physical accessory', async () => {
      await start()

      const heaterCooler = accessory('Aircon', 'AC-1', 'HeaterCooler', 'hap-hc', 10)
      const fan = accessory('Tower Fan', 'FAN-9', 'Fanv2', 'hap-fan', 11)
      sendData(heaterCooler, fan)

      expect((heaterCooler as any).linkedServices).toBeUndefined()
      expect(roomsHolding('hap-fan')).toHaveLength(1)
    })

    it('folds lock management into a lone lock mechanism', async () => {
      // So the long-press modal can offer the management settings
      await start()

      const mechanism = accessory('Front Door', 'LOCK-1', 'LockMechanism', 'hap-lock', 10)
      const management = accessory('Front Door', 'LOCK-1', 'LockManagement', 'hap-lock-mgmt', 11)
      sendData(mechanism, management)

      expect((mechanism as any).linkedServices[11]).toBe(management)
    })

    it('re-points the lock link at the current management object on the next event', async () => {
      // The link used to be made while the array still held the previous
      // objects, so it pointed at a management service that had already been
      // replaced - its values never updated again
      await start()

      sendData(
        accessory('Front Door', 'LOCK-1', 'LockMechanism', 'hap-lock', 10),
        accessory('Front Door', 'LOCK-1', 'LockManagement', 'hap-lock-mgmt', 11),
      )

      const mechanism = accessory('Front Door', 'LOCK-1', 'LockMechanism', 'hap-lock', 10)
      const management = accessory('Front Door', 'LOCK-1', 'LockManagement', 'hap-lock-mgmt', 11)
      sendData(mechanism, management)

      expect((mechanism as any).linkedServices[11]).toBe(management)
    })

    it('leaves a lock mechanism alone when the accessory has two of them', async () => {
      await start()

      const first = accessory('Front Door', 'LOCK-1', 'LockMechanism', 'hap-lock-1', 10)
      const second = accessory('Front Door', 'LOCK-1', 'LockMechanism', 'hap-lock-2', 12)
      const management = accessory('Front Door', 'LOCK-1', 'LockManagement', 'hap-lock-mgmt', 11)
      sendData(first, second, management)

      expect((first as any).linkedServices).toBeUndefined()
      expect((second as any).linkedServices).toBeUndefined()
    })
  })

  describe('HAP control helpers', () => {
    it('returns the characteristic the accessory has, and null for one it does not', async () => {
      await start()

      const switchService = rawHap()
      sendData(switchService)

      expect(charFor(switchService, 'On').type).toBe('On')
      expect(charFor(switchService, 'Brightness')).toBeNull()
    })

    it('sends nothing until HAP is ready for control', async () => {
      await start()

      const switchService = rawHap()
      sendData(switchService)

      await charFor(switchService, 'On').setValue(true)

      expect(io.socket.payloadsFor('accessory-control')).toEqual([])
    })

    it('addresses the accessory by aid, service iid and characteristic iid', async () => {
      await start()
      io.socket.fire('hap-accessories-ready-for-control')

      const switchService = rawHap({ aid: 7, iid: 30 })
      sendData(switchService)

      await charFor(switchService, 'On').setValue(true)

      expect(io.socket.payloadsFor('accessory-control')).toEqual([
        {
          set: {
            uniqueId: 'hap-1',
            aid: 7,
            // The service's own iid goes in `siid`; `iid` is the characteristic's
            siid: 30,
            iid: 11,
            value: true,
          },
        },
      ])
    })

    it('keeps a helper the service already has', async () => {
      // The same object arrives on every status event, so re-attaching would
      // discard the closure the accessory component is already holding
      await start()

      const switchService = rawHap()
      sendData(switchService)
      const first = switchService.getCharacteristic
      sendData(switchService)

      expect(switchService.getCharacteristic).toBe(first)
    })
  })

  describe('matter control helpers', () => {
    it('returns a cluster the device has, and null for one it does not', async () => {
      await start()

      const light = rawMatter() as ServiceTypeX
      sendData(light)

      expect(light.getCluster!('onOff')?.attributes).toEqual({ onOff: false })
      expect(light.getCluster!('levelControl')).toBeNull()
    })

    it('sends nothing until matter is ready for control', async () => {
      await start()

      const light = rawMatter() as ServiceTypeX
      sendData(light)

      await light.getCluster!('onOff')!.setAttributes({ onOff: true })

      expect(io.socket.payloadsFor('accessory-control')).toEqual([])
      expect(console.warn).toHaveBeenCalled()
    })

    it('names the cluster in the write', async () => {
      await start()
      io.socket.fire('matter-accessories-ready-for-control')

      const light = rawMatter({
        clusters: {
          onOff: { onOff: false },
          levelControl: { currentLevel: 100 },
        },
      }) as ServiceTypeX
      sendData(light)

      await light.getCluster!('levelControl')!.setAttributes({ currentLevel: 254 })

      expect(io.socket.payloadsFor('accessory-control')).toEqual([
        {
          set: {
            uniqueId: 'matter:light-1',
            cluster: 'levelControl',
            attributes: { currentLevel: 254 },
          },
        },
      ])
    })

    it('gives a matter service no HAP characteristic helper', async () => {
      await start()

      const light = rawMatter()
      sendData(light)

      expect(light.getCharacteristic).toBeUndefined()
    })
  })

  describe('saving the layout', () => {
    it('saves nothing once the session has stopped, so a modal left open can not wipe the rooms', async () => {
      // The info modal is opened on document.body, so it outlives the page. Pressing Back and then Save in it
      // used to send an empty layout, which the server stored as is.
      await start({
        layout: [
          {
            name: 'Kitchen',
            isDefault: true,
            services: [
              layoutEntry({ customName: 'Kettle' }),
            ],
          },
        ],
      })
      sendData(rawHap({ nameBasedUniqueId: 'nb-1' }))

      service.stop()
      service.saveLayout()
      await settle()

      expect(io.requests.filter(entry => entry.resource === 'save-layout')).toHaveLength(0)
    })

    it('sends the room names and the fields the layout needs', async () => {
      await start({
        layout: [
          {
            name: 'Kitchen',
            isDefault: true,
            services: [
              layoutEntry({
                customName: 'Kettle',
                customType: 'Outlet',
                hidden: true,
                onDashboard: true,
              }),
            ],
          },
        ],
      })
      sendData(rawHap({ nameBasedUniqueId: 'nb-1' }))

      service.saveLayout()
      await settle()

      const payload = io.requests.find(entry => entry.resource === 'save-layout')!
      expect(payload.payload.user).toBe('admin')
      expect(payload.payload.layout).toEqual([
        {
          name: 'Kitchen',
          isDefault: true,
          services: [
            {
              uniqueId: 'hap-1',
              nameBasedUniqueId: 'nb-1',
              name: 'Test Switch',
              serial: 'SERIAL-1',
              bridge: BRIDGE_A,
              aid: 1,
              iid: 10,
              uuid: '0000-Switch',
              customName: 'Kettle',
              customType: 'Outlet',
              hidden: true,
              onDashboard: true,
            },
          ],
        },
      ])
    })

    it('leaves the optional fields off rather than writing false', async () => {
      await start({
        layout: [
          { name: 'Kitchen', isDefault: true, services: [] },
        ],
      })
      sendData(rawHap())

      service.saveLayout()
      await settle()

      const saved = io.requests.find(entry => entry.resource === 'save-layout')!.payload.layout[0].services[0]
      expect(saved.customName).toBeUndefined()
      expect(saved.hidden).toBeUndefined()
      expect(saved.onDashboard).toBeUndefined()
      expect(saved.nameBasedUniqueId).toBeUndefined()
    })

    it('flags the first room as default when nothing is flagged', async () => {
      await start({
        layout: [
          { name: 'Kitchen', isDefault: true, services: [] },
        ],
      })
      // Simulate the page having cleared every default flag
      service.rooms.update(rooms => rooms.map(entry => ({ ...entry, isDefault: undefined })))

      service.saveLayout()
      await settle()

      const layout = io.requests.find(entry => entry.resource === 'save-layout')!.payload.layout
      expect(layout[0].isDefault).toBe(true)
    })

    it('keeps a service the server has not discovered this session', async () => {
      // A child bridge that is currently offline must not lose its room or its
      // custom name just because it was missing from one payload
      await start({
        layout: [
          {
            name: 'Kitchen',
            isDefault: true,
            services: [
              layoutEntry(),
              layoutEntry({
                uniqueId: 'hap-offline',
                name: 'Offline Switch',
                uuid: 'uuid-offline',
                customName: 'Garage',
              }),
            ],
          },
        ],
      })
      sendData(rawHap())

      service.saveLayout()
      await settle()

      const kitchen = io.requests.find(entry => entry.resource === 'save-layout')!.payload.layout[0]
      expect(kitchen.services.map((entry: AccessoryLayoutService) => entry.uniqueId)).toEqual(['hap-1', 'hap-offline'])
      expect(kitchen.services[1].customName).toBe('Garage')
    })

    it('moves an undiscovered service to the default room when its room was deleted', async () => {
      await start({
        layout: [
          { name: 'Kitchen', isDefault: true, services: [] },
          {
            name: 'Garage',
            services: [
              layoutEntry({ uniqueId: 'hap-offline', name: 'Offline Switch', uuid: 'uuid-offline' }),
            ],
          },
        ],
      })
      // The user deleted the Garage room while its accessory was offline
      service.rooms.update(rooms => rooms.filter(entry => entry.name !== 'Garage'))

      service.saveLayout()
      await settle()

      const layout = io.requests.find(entry => entry.resource === 'save-layout')!.payload.layout
      expect(layout.map((entry: any) => entry.name)).toEqual(['Kitchen'])
      expect(layout[0].services.map((entry: AccessoryLayoutService) => entry.uniqueId)).toEqual(['hap-offline'])
    })

    it('drops an undiscovered service that never had a name', async () => {
      // ⚠️ There is nothing worth preserving about it, and keeping it would write
      // a nameless accessory back into the layout on every save for ever
      await start({
        layout: [
          {
            name: 'Kitchen',
            isDefault: true,
            services: [
              layoutEntry({ uniqueId: 'hap-nameless', name: '', uuid: 'uuid-nameless' }),
            ],
          },
        ],
      })
      sendData(rawHap())

      service.saveLayout()
      await settle()

      const kitchen = io.requests.find(entry => entry.resource === 'save-layout')!.payload.layout[0]
      expect(kitchen.services.map((entry: AccessoryLayoutService) => entry.uniqueId)).toEqual(['hap-1'])
    })

    it('drops an undiscovered service when there is no room left to put it in', async () => {
      // ⚠️ Every room gone and no default to fall back on. Dropping it is the only
      // option left, and it must not throw on the way - the save has to complete or
      // the user's other changes are lost too
      await start({
        layout: [
          { name: 'Kitchen', isDefault: true, services: [] },
          {
            name: 'Garage',
            services: [
              layoutEntry({ uniqueId: 'hap-offline', name: 'Offline Switch', uuid: 'uuid-offline' }),
            ],
          },
        ],
      })
      service.rooms.set([])

      service.saveLayout()
      await settle()

      const layout = io.requests.find(entry => entry.resource === 'save-layout')!.payload.layout
      expect(layout).toEqual([])
    })

    it('keeps an empty room the user created', async () => {
      await start({
        layout: [
          { name: 'Kitchen', isDefault: true, services: [] },
        ],
      })
      service.rooms.update(rooms => [
        ...rooms,
        { name: 'New Room', services: [] },
      ])

      service.saveLayout()
      await settle()

      const layout = io.requests.find(entry => entry.resource === 'save-layout')!.payload.layout
      expect(layout.map((entry: any) => entry.name)).toEqual(['Kitchen', 'New Room'])
    })

    it('announces a successful save', async () => {
      await start()
      const saved = vi.fn()
      service.layoutSaved.subscribe(saved)

      service.saveLayout()
      await settle()

      expect(saved).toHaveBeenCalled()
    })

    it('toasts a failed save', async () => {
      await start()
      io.socket.respondTo('save-layout', () => ({
        error: { message: 'Layout could not be written' },
      }))

      service.saveLayout()
      await settle()

      expect(toastr.error).toHaveBeenCalledWith('Layout could not be written', 'toast.title_error')
      expect(console.error).toHaveBeenCalled()
    })
  })

  describe('the accessory information modal', () => {
    async function open() {
      await start({
        layout: [
          { name: 'Kitchen', isDefault: true, services: [] },
        ],
      })
      await settle()
      sendData(rawHap())

      const target = service.rooms()[0].services[0]
      const done = service.showAccessoryInformation(target)
      await settle()

      return { target, done, ref: modal.lastOpened()!.ref }
    }

    it('opens the information component as a large static modal', async () => {
      const { ref } = await open()

      expect(modal.lastOpened()!.content).toBe(AccessoryInfoComponent)
      expect(modal.lastOpened()!.options?.size).toBe('lg')
      expect(modal.lastOpened()!.options?.backdrop).toBe('static')

      ref.dismiss()
      await settle()
    })

    it('swaps in a new service object so the OnPush tile re-renders', async () => {
      // Re-emitting the rooms array with the same service reference only
      // re-checks the page, not the tile - the custom icon would stay stale
      const { target, ref } = await open()

      ref.close({
        customName: 'Kettle',
        customType: 'Outlet',
        hidden: false,
        onDashboard: true,
      })
      await settle()

      const current = service.rooms()[0].services[0]
      expect(current).not.toBe(target)
      expect(current.customName).toBe('Kettle')
      expect(current.customType).toBe('Outlet')
      expect(current.onDashboard).toBe(true)
    })

    it('keeps the flat accessory list pointing at the same object', async () => {
      const { ref } = await open()

      ref.close({
        customName: 'Kettle',
        customType: 'Outlet',
        hidden: false,
        onDashboard: false,
      })
      await settle()

      expect(service.accessories.services[0]).toBe(service.rooms()[0].services[0])
    })

    it('saves the layout when the modal is confirmed', async () => {
      const { ref } = await open()

      ref.close({
        customName: 'Kettle',
        customType: undefined,
        hidden: false,
        onDashboard: false,
      })
      await settle()

      expect(io.requests.some(entry => entry.resource === 'save-layout')).toBe(true)
    })

    it('saves nothing when the modal is dismissed', async () => {
      const { ref } = await open()

      ref.dismiss()
      await settle()

      expect(io.requests.some(entry => entry.resource === 'save-layout')).toBe(false)
      expect(service.rooms()[0].services[0].customName).toBeUndefined()
    })

    it('applies the result to the current object when the service was replaced mid-animation', async () => {
      // A status event during the close animation replaces the reference the
      // modal was opened with, so the result is matched back by uniqueId
      const { target, ref } = await open()

      const replacement = rawHap({
        values: { On: true },
      })
      sendData(replacement)
      expect(service.rooms()[0].services[0]).not.toBe(target)

      ref.close({
        customName: 'Kettle',
        customType: undefined,
        hidden: false,
        onDashboard: false,
      })
      await settle()

      const current = service.rooms()[0].services[0]
      expect(current.customName).toBe('Kettle')
      expect(current.values).toEqual({ On: true })
    })
  })

  describe('moving a service to another room', () => {
    /** A service as it sits in a room, with the custom fields the layout keeps. */
    function tile(uniqueId: string, extra: Record<string, unknown> = {}): ServiceTypeX {
      return {
        uniqueId,
        serviceName: uniqueId,
        customName: `${uniqueId} name`,
        customType: 'Switch',
        hidden: false,
        onDashboard: true,
        ...extra,
      } as unknown as ServiceTypeX
    }

    /** Set the rooms directly. No session is started, so saveLayout only records the call. */
    function setRooms(...rooms: Array<{ name: string, isDefault?: boolean, services: ServiceTypeX[] }>) {
      service.rooms.set(rooms)
    }

    it('reports the room a service is in, or nothing for an unknown service', () => {
      setRooms(
        {
          name: 'Kitchen',
          services: [
            tile('a'),
          ],
        },
        {
          name: 'Office',
          services: [
            tile('b'),
          ],
        },
      )

      expect(service.getRoomNameForService('b')).toBe('Office')
      expect(service.getRoomNameForService('missing')).toBeUndefined()
    })

    it('takes the same service object out of its room and appends it to the target room', () => {
      const moving = tile('a', { customName: 'Kettle', hidden: true, customType: 'Outlet' })
      setRooms(
        {
          name: 'Kitchen',
          services: [
            tile('x'),
            moving,
            tile('y'),
          ],
        },
        {
          name: 'Office',
          services: [
            tile('z'),
          ],
        },
      )

      service.moveServiceToRoom('a', 'Office')

      expect(idsIn('Kitchen')).toEqual(['x', 'y'])
      expect(idsIn('Office')).toEqual(['z', 'a'])
      expect(room('Office')!.services[1]).toBe(moving)
      expect(moving.customName).toBe('Kettle')
      expect(moving.hidden).toBe(true)
      expect(moving.customType).toBe('Outlet')
      expect(roomsHolding('a')).toEqual(['Office'])
    })

    it('leaves the order of the other services and rooms alone', () => {
      setRooms(
        {
          name: 'Kitchen',
          isDefault: true,
          services: [
            tile('a'),
            tile('b'),
            tile('c'),
          ],
        },
        {
          name: 'Office',
          services: [
            tile('d'),
            tile('e'),
          ],
        },
        {
          name: 'Garage',
          services: [
            tile('f'),
          ],
        },
      )

      service.moveServiceToRoom('b', 'Garage')

      expect(service.rooms().map(entry => entry.name)).toEqual(['Kitchen', 'Office', 'Garage'])
      expect(idsIn('Kitchen')).toEqual(['a', 'c'])
      expect(idsIn('Office')).toEqual(['d', 'e'])
      expect(idsIn('Garage')).toEqual(['f', 'b'])
      expect(room('Kitchen')!.isDefault).toBe(true)
    })

    it('hands the rooms signal new room objects so OnPush views refresh', () => {
      setRooms(
        {
          name: 'Kitchen',
          services: [
            tile('a'),
          ],
        },
        { name: 'Office', services: [] },
      )
      const before = service.rooms()

      service.moveServiceToRoom('a', 'Office')

      expect(service.rooms()).not.toBe(before)
      expect(service.rooms()[0]).not.toBe(before[0])
      expect(service.rooms()[1]).not.toBe(before[1])
    })

    it('saves the layout once after a move', () => {
      setRooms(
        {
          name: 'Kitchen',
          services: [
            tile('a'),
          ],
        },
        { name: 'Office', services: [] },
      )
      const save = vi.spyOn(service, 'saveLayout')

      service.moveServiceToRoom('a', 'Office')

      expect(save).toHaveBeenCalledTimes(1)
    })

    it('does nothing when the service is in no room', () => {
      setRooms({
        name: 'Kitchen',
        services: [
          tile('a'),
        ],
      }, { name: 'Office', services: [] })
      const before = service.rooms()
      const save = vi.spyOn(service, 'saveLayout')

      service.moveServiceToRoom('missing', 'Office')

      expect(service.rooms()).toBe(before)
      expect(save).not.toHaveBeenCalled()
    })

    it('does nothing when the target room does not exist', () => {
      setRooms({
        name: 'Kitchen',
        services: [
          tile('a'),
        ],
      })
      const before = service.rooms()
      const save = vi.spyOn(service, 'saveLayout')

      service.moveServiceToRoom('a', 'Attic')

      expect(service.rooms()).toBe(before)
      expect(idsIn('Kitchen')).toEqual(['a'])
      expect(save).not.toHaveBeenCalled()
    })

    it('does nothing when the service is already in that room', () => {
      setRooms({
        name: 'Kitchen',
        services: [
          tile('a'),
          tile('b'),
        ],
      }, { name: 'Office', services: [] })
      const before = service.rooms()
      const save = vi.spyOn(service, 'saveLayout')

      service.moveServiceToRoom('a', 'Kitchen')

      expect(service.rooms()).toBe(before)
      expect(idsIn('Kitchen')).toEqual(['a', 'b'])
      expect(save).not.toHaveBeenCalled()
    })
  })

  describe('moving and flagging several services at once', () => {
    afterEach(() => {
      localStorage.clear()
    })

    /** A service in a room, with only the fields these tests read. */
    function item(uniqueId: string, extra: Record<string, unknown> = {}): ServiceTypeX {
      return {
        uniqueId,
        serviceName: uniqueId,
        hidden: false,
        onDashboard: false,
        ...extra,
      } as unknown as ServiceTypeX
    }

    function idsIn(roomName: string): string[] {
      return service.rooms().find(room => room.name === roomName)!.services.map(entry => entry.uniqueId!)
    }

    beforeEach(() => {
      service.rooms.set([
        {
          name: 'Kitchen',
          services: [
            item('a'),
            item('b'),
          ],
        },
        {
          name: 'Office',
          services: [
            item('z'),
          ],
        },
      ])
    })

    it('moves each service to the room and saves the layout once', () => {
      const save = vi.spyOn(service, 'saveLayout')

      service.moveServicesToRoom(['a', 'b'], 'Office')

      expect(idsIn('Office')).toEqual(['z', 'a', 'b'])
      expect(idsIn('Kitchen')).toEqual([])
      expect(save).toHaveBeenCalledTimes(1)
    })

    it('moves the services it can and skips the rest', () => {
      const save = vi.spyOn(service, 'saveLayout')

      service.moveServicesToRoom(['a', 'z', 'missing'], 'Office')

      expect(idsIn('Office')).toEqual(['z', 'a'])
      expect(save).toHaveBeenCalledTimes(1)
    })

    it('saves nothing when no service moves', () => {
      const save = vi.spyOn(service, 'saveLayout')

      service.moveServicesToRoom(['z', 'missing'], 'Office')
      service.moveServicesToRoom(['a'], 'Nowhere')

      expect(save).not.toHaveBeenCalled()
    })
  })

  describe('placing a service by uniqueId', () => {
    /** A service in a room, with only the fields these tests read. */
    function item(uniqueId: string): ServiceTypeX {
      return {
        uniqueId,
        serviceName: uniqueId,
        hidden: false,
        onDashboard: false,
      } as unknown as ServiceTypeX
    }

    function idsIn(roomName: string): string[] {
      return service.rooms().find(room => room.name === roomName)!.services.map(entry => entry.uniqueId!)
    }

    beforeEach(() => {
      service.rooms.set([
        {
          name: 'Kitchen',
          isDefault: true,
          services: [
            item('a'),
            item('h'),
            item('b'),
            item('c'),
          ],
        },
        {
          name: 'Office',
          services: [
            item('z'),
            item('y'),
          ],
        },
      ])
    })

    it('places before the given service in the full list', () => {
      service.placeService('c', 'Kitchen', 'b', null)

      expect(idsIn('Kitchen')).toEqual(['a', 'h', 'c', 'b'])
    })

    it('places right after the given service when there is no before', () => {
      service.placeService('a', 'Kitchen', null, 'b')

      expect(idsIn('Kitchen')).toEqual(['h', 'b', 'a', 'c'])
    })

    it('places at the end when neither neighbour is given or present', () => {
      service.placeService('a', 'Office', 'missing', null)

      expect(idsIn('Office')).toEqual(['z', 'y', 'a'])
      expect(idsIn('Kitchen')).toEqual(['h', 'b', 'c'])
    })

    it('moves between rooms', () => {
      service.placeService('b', 'Office', 'y', null)

      expect(idsIn('Kitchen')).toEqual(['a', 'h', 'c'])
      expect(idsIn('Office')).toEqual(['z', 'b', 'y'])
    })

    it('reorders within a room, leaving hidden services where they are placed by the full list', () => {
      service.placeService('a', 'Kitchen', null, 'c')

      expect(idsIn('Kitchen')).toEqual(['h', 'b', 'c', 'a'])
    })

    it('keeps the default room flag', () => {
      service.placeService('z', 'Kitchen', null, null)

      expect(service.rooms().find(room => room.name === 'Kitchen')!.isDefault).toBe(true)
    })

    it('saves the layout once', () => {
      const save = vi.spyOn(service, 'saveLayout')

      service.placeService('b', 'Office', null, null)

      expect(save).toHaveBeenCalledTimes(1)
    })

    it('does nothing when the order does not change', () => {
      const save = vi.spyOn(service, 'saveLayout')

      service.placeService('b', 'Kitchen', 'c', null)
      service.placeService('unknown', 'Kitchen', null, null)
      service.placeService('a', 'Nowhere', null, null)

      expect(save).not.toHaveBeenCalled()
      expect(idsIn('Kitchen')).toEqual(['a', 'h', 'b', 'c'])
    })
  })

  describe('placing a room by name', () => {
    function room(name: string, isDefault = false): any {
      return { name, isDefault, services: [] }
    }

    beforeEach(() => {
      service.rooms.set([
        room('Kitchen', true),
        room('Hall'),
        room('Office'),
        room('Loft'),
      ])
    })

    function names(): string[] {
      return service.rooms().map(entry => entry.name)
    }

    it('places before the given room in the full list', () => {
      service.placeRoom('Loft', 'Kitchen', null)

      expect(names()).toEqual(['Loft', 'Kitchen', 'Hall', 'Office'])
    })

    it('places right after the given room when there is no before', () => {
      service.placeRoom('Kitchen', null, 'Office')

      expect(names()).toEqual(['Hall', 'Office', 'Kitchen', 'Loft'])
    })

    it('places at the end when neither neighbour is present', () => {
      service.placeRoom('Hall', 'Missing', null)

      expect(names()).toEqual(['Kitchen', 'Office', 'Loft', 'Hall'])
    })

    it('keeps the default room flag', () => {
      service.placeRoom('Kitchen', null, 'Loft')

      expect(service.rooms().find(entry => entry.name === 'Kitchen')!.isDefault).toBe(true)
    })

    it('saves the layout once, and nothing when the order is unchanged', () => {
      const save = vi.spyOn(service, 'saveLayout')

      service.placeRoom('Hall', 'Loft', null)
      expect(save).toHaveBeenCalledTimes(1)

      service.placeRoom('Hall', null, 'Office')
      service.placeRoom('Nowhere', null, null)
      expect(save).toHaveBeenCalledTimes(1)
    })
  })

  describe('the page filter', () => {
    afterEach(() => {
      localStorage.clear()
      vi.restoreAllMocks()
    })

    it('remembers the filter in localStorage under its key', () => {
      service.setFilterState({ ...DEFAULT_FILTER_STATE, search: 'kettle' })

      expect(JSON.parse(localStorage.getItem('accessories-filter-v1')!).search).toBe('kettle')
      expect(service.filterState().search).toBe('kettle')
    })

    it('changes the filter for this visit only when asked not to remember it', () => {
      service.setFilterState({ ...DEFAULT_FILTER_STATE, search: 'kettle' }, false)

      expect(service.filterState().search).toBe('kettle')
      expect(localStorage.getItem('accessories-filter-v1')).toBeNull()
    })

    it('still works when storage refuses to save', () => {
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new Error('quota')
      })

      expect(() => service.setFilterState({ ...DEFAULT_FILTER_STATE, search: 'kettle' })).not.toThrow()
      expect(service.filterState().search).toBe('kettle')
    })
  })

  describe('adding a room from the accessory information modal', () => {
    beforeEach(() => {
      setRooms()
    })

    function setRooms(...rooms: Array<{ name: string, isDefault?: boolean, services: ServiceTypeX[] }>) {
      service.rooms.set(rooms)
    }

    it('appends a new, empty, non-default room and returns true', () => {
      setRooms({ name: 'Kitchen', isDefault: true, services: [] })

      expect(service.addRoom('Garage')).toBe(true)

      expect(service.rooms().map(entry => entry.name)).toEqual(['Kitchen', 'Garage'])
      expect(room('Garage')).toEqual({ name: 'Garage', isDefault: false, services: [] })
    })

    it('trims the name before storing it', () => {
      expect(service.addRoom('  Garage  ')).toBe(true)

      expect(room('Garage')).toBeDefined()
      expect(service.rooms().map(entry => entry.name)).toEqual(['Garage'])
    })

    it('rejects a blank or whitespace-only name', () => {
      expect(service.addRoom('')).toBe(false)
      expect(service.addRoom('   ')).toBe(false)
      expect(service.rooms()).toEqual([])
    })

    it('rejects a name that matches an existing room case-insensitively, ignoring surrounding spaces', () => {
      setRooms({ name: 'Kitchen', services: [] })

      expect(service.addRoom('kitchen')).toBe(false)
      expect(service.addRoom(' KITCHEN ')).toBe(false)
      expect(service.rooms().map(entry => entry.name)).toEqual(['Kitchen'])
    })
  })

  describe('the room picked in the information modal, applied on save', () => {
    /** Open the modal on hap-1, which the layout puts in Kitchen, with an Office room beside it. */
    async function openOnKitchen() {
      await start({
        layout: [
          { name: 'Kitchen', isDefault: true, services: [] },
          { name: 'Office', services: [] },
        ],
      })
      await settle()
      sendData(rawHap())

      const target = service.rooms()[0].services[0]
      void service.showAccessoryInformation(target)
      await settle()

      return modal.lastOpened()!.ref
    }

    it('moves the accessory and saves once, with the field changes, when Save names another room', async () => {
      const ref = await openOnKitchen()

      ref.close({
        customName: 'Kettle',
        customType: undefined,
        hidden: false,
        onDashboard: false,
        room: 'Office',
      })
      await settle()

      expect(roomsHolding('hap-1')).toEqual(['Office'])
      expect(room('Office')!.services[0].customName).toBe('Kettle')
      expect(io.requests.filter(entry => entry.resource === 'save-layout')).toHaveLength(1)
    })

    it('creates a new room on save and moves the accessory into it', async () => {
      const ref = await openOnKitchen()

      ref.close({
        customName: undefined,
        customType: undefined,
        hidden: false,
        onDashboard: false,
        room: 'Garage',
      })
      await settle()

      expect(service.rooms().map(entry => entry.name)).toEqual(['Kitchen', 'Office', 'Garage'])
      expect(roomsHolding('hap-1')).toEqual(['Garage'])
      expect(io.requests.filter(entry => entry.resource === 'save-layout')).toHaveLength(1)
    })

    it('leaves the accessory where it is when Save does not name a room', async () => {
      const ref = await openOnKitchen()

      ref.close({
        customName: 'Kettle',
        customType: undefined,
        hidden: false,
        onDashboard: false,
      })
      await settle()

      expect(roomsHolding('hap-1')).toEqual(['Kitchen'])
      expect(io.requests.filter(entry => entry.resource === 'save-layout')).toHaveLength(1)
    })

    it('moves nothing and creates no room when the modal is dismissed', async () => {
      const ref = await openOnKitchen()

      ref.dismiss()
      await settle()

      expect(roomsHolding('hap-1')).toEqual(['Kitchen'])
      expect(room('Garage')).toBeUndefined()
      expect(io.requests.some(entry => entry.resource === 'save-layout')).toBe(false)
    })
  })

  describe('stopping a session', () => {
    it('ends the socket and clears the state', async () => {
      await start({
        layout: [
          { name: 'Kitchen', isDefault: true, services: [] },
        ],
      })
      sendData(rawHap())

      service.stop()

      expect(io.end).toHaveBeenCalled()
      expect(service.rooms()).toEqual([])
      expect(service.accessories.services).toEqual([])
    })

    it('drops an accessories-data event that lands after the stop', async () => {
      // The payload can be in flight between `io.end()` and the socket
      // actually closing; pushing it would resurrect stale services
      await start({
        layout: [
          { name: 'Kitchen', isDefault: true, services: [] },
        ],
      })

      service.stop()
      sendData(rawHap())

      expect(service.rooms()).toEqual([])
      expect(service.accessories.services).toEqual([])
    })

    it('keeps the accessoryData subscribers alive across a stop and start', async () => {
      // Completing the public Subjects on stop killed the accessories page's
      // subscription on the first reload, hiding a late-discovered bridge
      // until a manual page refresh
      await start()
      const seen = vi.fn()
      service.accessoryData.subscribe(seen)

      sendData(rawHap())
      expect(seen).toHaveBeenCalledTimes(1)

      service.stop()
      await service.start()
      seen.mockClear()
      sendData(rawHap())

      expect(seen).toHaveBeenCalled()
    })

    it('takes its socket handlers off on stop, so a restart never adds a second set', async () => {
      // `io.end()` only emits `end` - the namespace is cached and shared, so its
      // listeners stay unless stop() removes them. The page and the dashboard
      // widget both start and stop the session, so each visit used to add one
      // more set: N error toasts for one failure, N reloads for one new bridge
      await start()
      expect(io.socket.handlers('accessories-data')).toHaveLength(1)

      service.stop()
      await service.start()

      for (const event of [
        'accessories-data',
        'accessories-reload-required',
        'matter-accessories-reload-required',
        'accessory-control-failure',
        'hap-accessories-ready-for-control',
        'matter-accessories-ready-for-control',
      ]) {
        expect(io.socket.handlers(event)).toHaveLength(1)
      }

      io.socket.fire('accessory-control-failure', 'Accessory not found')
      expect(toastr.error).toHaveBeenCalledTimes(1)
    })

    it('keeps the layoutSaved subscribers alive across a stop and start', async () => {
      await start()
      const saved = vi.fn()
      service.layoutSaved.subscribe(saved)

      service.stop()
      await service.start()
      service.saveLayout()
      await settle()

      expect(saved).toHaveBeenCalledTimes(1)
    })

    it('can still ask for the accessories after a restart', async () => {
      // `stop$` has to be replaced, not just completed, or every takeUntil in
      // the next session unsubscribes immediately
      await start()

      service.stop()
      await service.start()

      expect(io.socket.payloadsFor('get-accessories')).toHaveLength(2)
    })
  })

  describe('saved views, labels and floors', () => {
    const savedView = {
      id: 'v1',
      name: 'Downstairs',
      state: {
        groupBy: 'floor',
        labels: ['Bedtime'],
      },
      pinned: ['a1'],
      excluded: ['b2'],
      shared: false,
    }
    const sharedByAlice = {
      id: 'v2',
      name: 'Alice lights',
      state: {
        categories: ['lights'],
      },
      shared: true,
      owner: 'alice',
    }

    /** The payloads of every save-views request sent so far. */
    function saves(): any[] {
      return io.requests.filter(entry => entry.resource === 'save-views').map(entry => entry.payload)
    }

    /** Let the debounced save go out. */
    function flushDebounce() {
      vi.advanceTimersByTime(300)
    }

    beforeEach(() => {
      vi.useFakeTimers()
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    describe('loading', () => {
      it('loads the views, labels and floors on start', async () => {
        await start({
          views: {
            views: [savedView, sharedByAlice],
            labels: {
              a1: ['Bedtime'],
            },
            floors: [
              {
                name: 'Ground',
                rooms: ['Kitchen'],
              },
            ],
          },
        })

        expect(io.requests.some(entry => entry.resource === 'get-views')).toBe(true)
        expect(service.views()).toEqual([savedView, sharedByAlice])
        expect(service.labels()).toEqual({
          a1: ['Bedtime'],
        })
        expect(service.floors()).toEqual([
          {
            name: 'Ground',
            rooms: ['Kitchen'],
          },
        ])
      })

      it('starts empty when the views cannot be read, and does not save over them', async () => {
        await start({ views: null })

        expect(service.views()).toEqual([])
        expect(service.labels()).toEqual({})
        expect(service.floors()).toEqual([])

        service.createViewFromState('New', { groupBy: 'room' })
        flushDebounce()

        expect(saves()).toHaveLength(0)
      })
    })

    describe('creating a view', () => {
      it('adds the filter as a view of the user\'s own, and returns its id', async () => {
        await start()

        const id = service.createViewFromState('  Kitchen  ', {
          categories: ['lights'],
        })

        expect(id).toEqual(expect.any(String))
        expect(service.views()).toEqual([
          expect.objectContaining({
            id,
            name: 'Kitchen',
            state: {
              categories: ['lights'],
            },
            pinned: [],
            excluded: [],
            shared: false,
          }),
        ])
      })

      it('refuses a blank name', async () => {
        await start()

        expect(service.createViewFromState('   ', { groupBy: 'room' })).toBeNull()
        expect(service.views()).toEqual([])
      })

      it('copies the state, so later changes to the filter do not reach the view', async () => {
        await start()
        const state: any = {
          categories: ['lights'],
        }

        service.createViewFromState('Lights', state)
        state.categories.push('climate')

        expect(service.views()[0].state).toEqual({
          categories: ['lights'],
        })
      })
    })

    describe('saving', () => {
      it('sends the own views, without owner, with the labels and floors, after a quiet spell', async () => {
        await start({
          views: {
            views: [savedView, sharedByAlice],
            labels: {
              a1: ['Bedtime'],
            },
            floors: [
              {
                name: 'Ground',
                rooms: ['Kitchen'],
              },
            ],
          },
        })

        service.updateView('v1', { name: 'Ground floor' })
        service.setLabels('a1', ['Bedtime', 'Guest'])
        expect(saves()).toHaveLength(0)

        flushDebounce()

        expect(saves()).toHaveLength(1)
        expect(saves()[0]).toEqual({
          views: [
            { ...savedView, name: 'Ground floor', owner: undefined },
          ],
          labels: {
            a1: ['Bedtime', 'Guest'],
          },
          floors: [
            {
              name: 'Ground',
              rooms: ['Kitchen'],
            },
          ],
        })
        expect(saves()[0].views.some((view: any) => view.id === 'v2')).toBe(false)
      })

      it('announces each successful save', async () => {
        await start()
        const announced = vi.fn()
        service.viewsSaved.subscribe(announced)

        service.createViewFromState('Lights', {
          categories: ['lights'],
        })
        flushDebounce()

        expect(announced).toHaveBeenCalledTimes(1)
      })

      it('sends a pending save when the session stops, rather than dropping it', async () => {
        await start()

        service.createViewFromState('Lights', {
          categories: ['lights'],
        })
        service.stop()

        expect(saves()).toHaveLength(1)
        expect(saves()[0].views[0].name).toBe('Lights')
      })

      it('does not send anything after the session stops', async () => {
        await start()
        service.stop()

        service.setLabels('a1', ['Late'])
        flushDebounce()

        expect(saves()).toHaveLength(0)
      })
    })

    describe('changing a view', () => {
      it('renames, re-filters and sets the pinned and excluded accessories of an own view', async () => {
        await start({
          views: {
            views: [savedView],
            labels: {},
            floors: [],
          },
        })

        const changed = service.updateView('v1', {
          name: '  Upstairs  ',
          state: { groupBy: 'none' },
          pinned: ['c3'],
          excluded: [],
        })

        expect(changed).toBe(true)
        expect(service.views()[0]).toEqual(expect.objectContaining({
          name: 'Upstairs',
          state: { groupBy: 'none' },
          pinned: ['c3'],
          excluded: [],
        }))
      })

      it('leaves a view shared by someone else alone', async () => {
        await start({
          views: {
            views: [sharedByAlice],
            labels: {},
            floors: [],
          },
        })

        expect(service.updateView('v2', { name: 'Mine now' })).toBe(false)
        expect(service.deleteView('v2')).toBe(false)
        expect(service.toggleShare('v2')).toBe(false)
        expect(service.views()).toEqual([sharedByAlice])
      })

      it('deletes an own view, and clears it as the active one', async () => {
        await start({
          views: {
            views: [savedView],
            labels: {},
            floors: [],
          },
        })
        service.activeViewId.set('v1')

        expect(service.deleteView('v1')).toBe(true)

        expect(service.views()).toEqual([])
        expect(service.activeViewId()).toBeNull()
      })

      it('moves a view up and down, and does nothing past either end', async () => {
        const second = { ...savedView, id: 'v9', name: 'Second' }
        await start({
          views: {
            views: [savedView, second],
            labels: {},
            floors: [],
          },
        })

        expect(service.reorderViews('v1', -1)).toBe(false)
        expect(service.reorderViews('v9', 1)).toBe(false)
        expect(service.reorderViews('v9', -1)).toBe(true)

        expect(service.views().map(view => view.id)).toEqual(['v9', 'v1'])
      })

      it('turns sharing on and off for an own view only', async () => {
        await start({
          views: {
            views: [savedView, sharedByAlice],
            labels: {},
            floors: [],
          },
        })

        expect(service.toggleShare('v1')).toBe(true)
        expect(service.views()[0].shared).toBe(true)
        expect(service.toggleShare('v1')).toBe(true)
        expect(service.views()[0].shared).toBe(false)
        expect(service.toggleShare('v2')).toBe(false)
      })

      it('tells whose a view is', async () => {
        await start()

        expect(service.isOwnView(savedView as any)).toBe(true)
        expect(service.isOwnView(sharedByAlice as any)).toBe(false)
      })
    })

    describe('the filter context for the active view', () => {
      it('holds the pinned and excluded accessories of the active view, and the labels', async () => {
        await start({
          views: {
            views: [savedView],
            labels: {
              a1: ['Bedtime'],
            },
            floors: [],
          },
        })
        service.activeViewId.set('v1')

        const context = service.filterContext()

        expect([...context.pinned!]).toEqual(['a1'])
        expect([...context.excluded!]).toEqual(['b2'])
        expect(context.labels!.get('a1')).toEqual(['Bedtime'])
      })

      it('holds nothing extra when no view is active', async () => {
        await start({
          views: {
            views: [savedView],
            labels: {},
            floors: [],
          },
        })

        const context = service.filterContext()

        expect([...context.pinned!]).toEqual([])
        expect([...context.excluded!]).toEqual([])
      })
    })

    describe('labels', () => {
      it('sets the labels of an accessory, trimmed and without repeats or blanks', async () => {
        await start()

        service.setLabels('a1', [
          ' Bedtime ',
          'Bedtime',
          '',
          '  ',
          'Guest',
        ])

        expect(service.labels()).toEqual({
          a1: ['Bedtime', 'Guest'],
        })
      })

      it('removes the entry when the labels are emptied', async () => {
        await start({
          views: {
            views: [],
            labels: {
              a1: ['Bedtime'],
            },
            floors: [],
          },
        })

        service.setLabels('a1', [])

        expect(service.labels()).toEqual({})
      })

      it('sends nothing when the labels did not change', async () => {
        await start({
          views: {
            views: [],
            labels: {
              a1: ['Bedtime'],
            },
            floors: [],
          },
        })

        service.setLabels('a1', ['Bedtime'])
        flushDebounce()

        expect(saves()).toHaveLength(0)
      })

      it('ignores an accessory with no id', async () => {
        await start()

        service.setLabels('', ['Bedtime'])
        flushDebounce()

        expect(service.labels()).toEqual({})
        expect(saves()).toHaveLength(0)
      })

      it('sets the labels from the accessory information modal on Save, with the rest of the changes', async () => {
        await start({
          layout: [
            { name: 'Kitchen', isDefault: true, services: [] },
          ],
        })
        await settle()
        sendData(rawHap())
        const target = service.rooms()[0].services[0]
        void service.showAccessoryInformation(target)
        await settle()

        modal.lastOpened()!.ref.close({
          customName: 'Kettle',
          customType: undefined,
          hidden: false,
          onDashboard: false,
          labels: ['Bedtime'],
        })
        await settle()

        expect(service.labels()[target.uniqueId!]).toEqual(['Bedtime'])
        flushDebounce()
        expect(saves()[0].labels).toEqual({
          [target.uniqueId!]: ['Bedtime'],
        })
      })
    })

    describe('floors', () => {
      it('puts a room on a floor, taking it off the floor it was on', async () => {
        await start({
          views: {
            views: [],
            labels: {},
            floors: [
              {
                name: 'Ground',
                rooms: ['Kitchen'],
              },
              { name: 'Upstairs', rooms: [] },
            ],
          },
        })

        service.setRoomFloor('Kitchen', 'Upstairs')

        expect(service.floors()).toEqual([
          { name: 'Ground', rooms: [] },
          {
            name: 'Upstairs',
            rooms: ['Kitchen'],
          },
        ])
      })

      it('takes a room off every floor with null', async () => {
        await start({
          views: {
            views: [],
            labels: {},
            floors: [
              {
                name: 'Ground',
                rooms: ['Kitchen'],
              },
            ],
          },
        })

        service.setRoomFloor('Kitchen', null)

        expect(service.floors()).toEqual([
          { name: 'Ground', rooms: [] },
        ])
      })

      it('creates a floor that does not exist yet, and reuses one that differs only in case', async () => {
        await start({
          views: {
            views: [],
            labels: {},
            floors: [
              { name: 'Ground', rooms: [] },
            ],
          },
        })

        service.setRoomFloor('Kitchen', 'Basement')
        service.setRoomFloor('Hall', 'ground')

        expect(service.floors()).toEqual([
          {
            name: 'Ground',
            rooms: ['Hall'],
          },
          {
            name: 'Basement',
            rooms: ['Kitchen'],
          },
        ])
      })

      it('sends nothing when the room is already on that floor', async () => {
        await start({
          views: {
            views: [],
            labels: {},
            floors: [
              {
                name: 'Ground',
                rooms: ['Kitchen'],
              },
            ],
          },
        })

        service.setRoomFloor('Kitchen', 'Ground')
        flushDebounce()

        expect(saves()).toHaveLength(0)
      })

      it('adds an empty floor, refusing blanks and duplicates', async () => {
        await start({
          views: {
            views: [],
            labels: {},
            floors: [
              { name: 'Ground', rooms: [] },
            ],
          },
        })

        expect(service.addFloor('  Upstairs ')).toBe(true)
        expect(service.addFloor('ground')).toBe(false)
        expect(service.addFloor('   ')).toBe(false)
        expect(service.floors().map(floor => floor.name)).toEqual(['Ground', 'Upstairs'])
      })

      it('renames a floor, keeping its rooms, and refuses a name another floor has', async () => {
        await start({
          views: {
            views: [],
            labels: {},
            floors: [
              {
                name: 'Ground',
                rooms: ['Kitchen'],
              },
              { name: 'Upstairs', rooms: [] },
            ],
          },
        })

        expect(service.renameFloor('Ground', 'Upstairs')).toBe(false)
        expect(service.renameFloor('Ground', '  Main  ')).toBe(true)
        expect(service.renameFloor('Missing', 'Other')).toBe(false)

        expect(service.floors()).toEqual([
          {
            name: 'Main',
            rooms: ['Kitchen'],
          },
          { name: 'Upstairs', rooms: [] },
        ])
      })

      it('deletes a floor and leaves its rooms on no floor', async () => {
        await start({
          views: {
            views: [],
            labels: {},
            floors: [
              {
                name: 'Ground',
                rooms: ['Kitchen'],
              },
            ],
          },
        })

        expect(service.deleteFloor('Ground')).toBe(true)
        expect(service.deleteFloor('Ground')).toBe(false)

        expect(service.floors()).toEqual([])
      })

      it('follows a room rename into the floors', async () => {
        await start({
          views: {
            views: [],
            labels: {},
            floors: [
              {
                name: 'Ground',
                rooms: ['Kitchen'],
              },
            ],
          },
        })

        service.renameRoomInFloors('Kitchen', 'Kitchenette')
        service.renameRoomInFloors('Kitchen', 'Kitchenette')

        expect(service.floors()).toEqual([
          {
            name: 'Ground',
            rooms: ['Kitchenette'],
          },
        ])
      })

      it('follows a room delete into the floors', async () => {
        await start({
          views: {
            views: [],
            labels: {},
            floors: [
              {
                name: 'Ground',
                rooms: ['Kitchen', 'Hall'],
              },
            ],
          },
        })

        service.removeRoomFromFloors('Kitchen')

        expect(service.floors()).toEqual([
          {
            name: 'Ground',
            rooms: ['Hall'],
          },
        ])
      })
    })
  })
})

import type { FakeIoNamespace, FakeModalService, FakeSettings, FakeWs } from '@/testing'

import { NO_ERRORS_SCHEMA, signal } from '@angular/core'
import { ComponentFixture, TestBed } from '@angular/core/testing'
import { provideRouter } from '@angular/router'
import { TranslatePipe } from '@ngx-translate/core'
import { DragulaService } from 'ng2-dragula'
import { Subject } from 'rxjs'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { AccessoriesService } from '@/app/core/accessories/accessories.service'
import { DEFAULT_FILTER_STATE } from '@/app/core/accessories/filters/accessory-filters'
import { ConvertTempPipe } from '@/app/core/pipes/convert-temp.pipe'
import { AccessoriesComponent } from '@/app/modules/accessories/accessories.component'
import { AccessorySupportComponent } from '@/app/modules/accessories/accessory-support/accessory-support.component'
import { AddRoomComponent } from '@/app/modules/accessories/add-room/add-room.component'
import { EditRoomComponent } from '@/app/modules/accessories/edit-room/edit-room.component'
import { ADD_ROOM_MODAL_DATA, EDIT_ROOM_MODAL_DATA } from '@/app/modules/accessories/modal-data-tokens'
import { fakeWs, makeAuth, makeSettings, modalServiceSpy, toastrStub } from '@/testing'
import { provideFakes, provideTestTranslate } from '@/testing/providers'

/**
 * The accessories page.
 *
 * Two features overlap here in a way that caused #2790: a bridge filter that
 * hides tiles, and drag-and-drop reordering that splices a model by index. With
 * tiles hidden, the model indexes and the DOM indexes no longer line up, and a
 * drop moves an accessory the user was not touching.
 *
 * The fix is that the two never share a drag system. Manage-layout mode with no
 * filter uses dragula, where every tile is shown and the model stays 1-to-1 with
 * the DOM. With a filter on, manage-layout mode uses CDK drag-and-drop, which moves
 * accessories by uniqueId, so hidden tiles keep their places. Each bridge is named by
 * the name it advertises on its accessories.
 */
describe('accessoriesComponent', () => {
  let settings: FakeSettings
  let ws: FakeWs
  let statusIo: FakeIoNamespace
  let childIo: FakeIoNamespace
  let modal: FakeModalService
  let accessories: Record<string, any>
  let accessoryData: Subject<any>
  let dragula: Record<string, ReturnType<typeof vi.fn>>
  let dropEvents: Subject<any>
  let fixture: ComponentFixture<AccessoriesComponent>

  /**
   * Build the page.
   * @param options - how to set it up
   * @param options.rooms - the room layout the service reports
   * @param options.availableBridges - the bridges the filter can offer
   * @param options.filter - the filter's starting state
   * @param options.env - settings env overrides
   * @param options.admin - whether the signed-in user is an admin
   * @param options.bridgeNames - the username-to-name map the service holds
   * @param options.childBridges - what the child-bridge socket reports
   */
  async function open(options: {
    rooms?: any[]
    availableBridges?: string[]
    filter?: Record<string, any>
    env?: Record<string, any>
    admin?: boolean
    bridgeNames?: Map<string, string>
    childBridges?: Array<{ username: string, name: string }>
  } = {}) {
    TestBed.resetTestingModule()
    settings = makeSettings({ env: options.env })
    ws = fakeWs()
    statusIo = ws.namespace('status')
    childIo = ws.namespace('child-bridges')
    modal = modalServiceSpy()
    accessoryData = new Subject()
    dropEvents = new Subject()

    // The page calls `.forEach` on this straight away, so an unanswered request
    // throws inside an rxjs subscriber rather than failing an assertion
    childIo.socket.respondTo('get-homebridge-child-bridge-status', options.childBridges ?? [])

    accessories = {
      bridgeUsernameToNameMap: new Map<string, string>(options.bridgeNames ?? []),
      rooms: signal(options.rooms ?? []),
      availableBridges: signal(options.availableBridges ?? []),
      layoutSaved: new Subject<void>(),
      metadataSaved: new Subject<void>(),
      labels: signal<Record<string, string[]>>({}),
      floors: signal<any[]>([]),
      filterContext: vi.fn(() => ({
        labels: new Map(),
        floors: [],
      })),
      renameRoomInFloors: vi.fn(),
      removeRoomFromFloors: vi.fn(),
      setRoomFloor: vi.fn(),
      filterState: signal<any>({
        ...DEFAULT_FILTER_STATE,
        ...(options.filter ?? {}),
      }),
      setFilterState: vi.fn((state: any) => accessories.filterState.set(state)),
      moveServicesToRoom: vi.fn(),
      getRoomNameForService: vi.fn((uniqueId: string) => accessories.rooms().find((room: any) => room.services.some((service: any) => service.uniqueId === uniqueId))?.name),
      addRoom: vi.fn((name: string) => {
        const trimmed = name.trim()
        const taken = accessories.rooms().some((room: any) => room.name.toLowerCase() === trimmed.toLowerCase())
        if (!trimmed || taken) {
          return false
        }
        accessories.rooms.update((current: any[]) => [
          ...current,
          { name: trimmed, services: [] },
        ])
        return true
      }),
      placeService: vi.fn(),
      placeRoom: vi.fn(),
      accessoryData,
      start: vi.fn(async () => undefined),
      stop: vi.fn(),
      saveLayout: vi.fn(),
      loadLayout: vi.fn(async () => undefined),
    }

    dragula = {
      createGroup: vi.fn(),
      destroy: vi.fn(),
      drop: vi.fn(() => dropEvents),
    }

    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideTestTranslate(),
        provideFakes({
          settings,
          ws,
          modal,
          toastr: toastrStub(),
          auth: makeAuth({
            user: { admin: options.admin ?? true },
          }),
        }),
        { provide: AccessoriesService, useValue: accessories },
        { provide: DragulaService, useValue: dragula },
      ],
    })

    // The tiles are covered by their own routing spec, and dragula needs a real
    // layout to do anything useful
    TestBed.overrideComponent(AccessoriesComponent, {
      set: {
        imports: [TranslatePipe, ConvertTempPipe],
        schemas: [NO_ERRORS_SCHEMA],
      },
    })

    fixture = TestBed.createComponent(AccessoriesComponent)
    fixture.detectChanges()
    await fixture.whenStable()

    for (let tick = 0; tick < 10; tick += 1) {
      await Promise.resolve()
    }

    return fixture.componentInstance
  }

  /** A room as the page receives it. */
  function roomOf(name: string, services: any[]): any {
    return { name, services }
  }

  /**
   * A service as the accessories page receives it.
   * @param overrides - fields to change
   */
  function makeService(overrides: Record<string, any> = {}): any {
    return {
      uniqueId: 'service-1',
      hidden: false,
      instance: { username: '0E:11:11:11:11:11', name: 'Homebridge' },
      ...overrides,
    }
  }

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('opening the page', () => {
    it('names itself in the page title', async () => {
      await open()

      expect(settings.setPageTitle).toHaveBeenCalledWith('menu.label_accessories')
    })

    it('starts the accessory feed', async () => {
      await open()

      expect(accessories.start).toHaveBeenCalled()
    })

    it('starts with the layout locked', async () => {
      const page = await open()

      // Rooms and tiles are only draggable once the user asks for it, or a
      // stray touch on a phone reorders their home
      expect(page.layoutLocked()).toBe(true)
      expect(page.manageLayoutMode).toBe(false)
    })

    it('stops the feed when the page closes', async () => {
      await open()

      TestBed.resetTestingModule()

      expect(accessories.stop).toHaveBeenCalled()
    })

    it('uses the saved filter, so the toolbar opens as the user left it', async () => {
      const page = await open({
        rooms: [
          roomOf('Kitchen', [
            makeService({ uniqueId: 'a' }),
          ]),
        ],
        filter: {
          rooms: ['Kitchen'],
          showHidden: true,
        },
      })

      expect(page.filter().rooms).toEqual(['Kitchen'])
      expect(page.filter().showHidden).toBe(true)
    })

    it('does not offer the toolbar when no plugins are installed', async () => {
      const page = await open({
        env: { hasInstalledPlugins: false },
      })

      expect(page.hasPlugins()).toBe(false)
    })
  })

  describe('the filtered result', () => {
    it('shows the accessories of every room by default', async () => {
      const page = await open({
        rooms: [
          roomOf('Kitchen', [
            makeService({ uniqueId: 'a' }),
          ]),
          roomOf('Office', [
            makeService({ uniqueId: 'b' }),
          ]),
        ],
      })

      expect(page.groups().map(group => group.key)).toEqual(['Kitchen', 'Office'])
      expect(page.shownCount()).toBe(2)
      expect(page.totalCount()).toBe(2)
    })

    it('hides hidden accessories until the user asks for them', async () => {
      const page = await open({
        rooms: [
          roomOf('Kitchen', [
            makeService({ uniqueId: 'a' }),
            makeService({ uniqueId: 'h', hidden: true }),
          ]),
        ],
      })

      expect(page.shownCount()).toBe(1)

      page.onFilterChange({
        ...page.filter(),
        showHidden: true,
      })

      expect(page.shownCount()).toBe(2)
    })

    it('narrows to the rooms picked', async () => {
      const page = await open({
        rooms: [
          roomOf('Kitchen', [
            makeService({ uniqueId: 'a' }),
          ]),
          roomOf('Office', [
            makeService({ uniqueId: 'b' }),
          ]),
        ],
        filter: {
          rooms: ['Office'],
        },
      })

      expect(page.groups().map(group => group.key)).toEqual(['Office'])
      expect(page.shownCount()).toBe(1)
    })

    it('searches the custom name, ignoring case', async () => {
      const page = await open({
        rooms: [
          roomOf('Kitchen', [
            makeService({ uniqueId: 'a', customName: 'Kettle' }),
            makeService({ uniqueId: 'b', customName: 'Lamp' }),
          ]),
        ],
        filter: { search: 'KETT' },
      })

      expect(page.groups()[0].services.map(service => service.uniqueId)).toEqual(['a'])
    })

    it('filters by the bridge name each accessory advertises', async () => {
      const page = await open({
        rooms: [
          roomOf('Kitchen', [
            makeService({
              uniqueId: 'a',
              instance: { username: 'AA:11', name: 'Kitchen Bridge' },
            }),
            makeService({
              uniqueId: 'b',
              instance: { username: 'BB:22', name: 'Homebridge' },
            }),
          ]),
        ],
        availableBridges: ['Kitchen Bridge', 'Homebridge'],
        filter: {
          bridges: ['Kitchen Bridge'],
        },
      })

      expect(page.groups()[0].services.map(service => service.uniqueId)).toEqual(['a'])
    })

    it('drops rooms with nothing left once a filter is on', async () => {
      const page = await open({
        rooms: [
          roomOf('Kitchen', [
            makeService({ uniqueId: 'a', customName: 'Kettle' }),
          ]),
          roomOf('Office', [
            makeService({ uniqueId: 'b', customName: 'Lamp' }),
          ]),
        ],
        filter: { search: 'lamp' },
      })

      expect(page.groups().map(group => group.key)).toEqual(['Office'])
    })

    it('groups by category, keyed by the category', async () => {
      const page = await open({
        rooms: [
          roomOf('Kitchen', [
            makeService({ uniqueId: 'a', type: 'Lightbulb' }),
            makeService({ uniqueId: 'b', type: 'TemperatureSensor' }),
          ]),
        ],
        filter: { groupBy: 'category' },
      })

      expect(page.groups().map(group => group.key)).toEqual(['lights', 'sensors'])
      expect(page.groups().map(group => group.label)).toEqual(['accessories.categories.lights', 'accessories.categories.sensors'])
    })

    it('sorts by name when asked', async () => {
      const page = await open({
        rooms: [
          roomOf('Kitchen', [
            makeService({ uniqueId: 'b', customName: 'Lamp' }),
            makeService({ uniqueId: 'a', customName: 'Kettle' }),
          ]),
        ],
        filter: { sortBy: 'name' },
      })

      expect(page.groups()[0].services.map(service => service.uniqueId)).toEqual(['a', 'b'])
    })

    it('shows absolutely everything in manage layout mode', async () => {
      const page = await open({
        rooms: [
          roomOf('Kitchen', [
            makeService({ uniqueId: 'a' }),
            makeService({ uniqueId: 'h', hidden: true }),
          ]),
        ],
      })

      page.toggleManageLayout()
      fixture.detectChanges()

      // The drag model and the DOM must match one-to-one, so the hidden tile is still drawn
      expect(fixture.nativeElement.querySelectorAll('app-accessory-tile').length).toBe(2)
    })
  })

  describe('manage layout mode', () => {
    it('unlocks the layout and keeps the filter while on', async () => {
      const page = await open({
        rooms: [
          roomOf('Kitchen', [
            makeService({ uniqueId: 'a' }),
          ]),
        ],
        filter: {
          rooms: ['Kitchen'],
          showHidden: true,
        },
      })

      page.toggleManageLayout()

      expect(page.manageLayoutMode).toBe(true)
      expect(page.layoutLocked()).toBe(false)
      expect(page.filter().rooms).toEqual(['Kitchen'])
      expect(page.filter().showHidden).toBe(true)
    })

    it('keeps the grouping, sort and filters unchanged when manage layout turns on and off', async () => {
      const page = await open({
        rooms: [
          roomOf('Kitchen', [
            makeService({ uniqueId: 'a' }),
          ]),
        ],
        filter: {
          groupBy: 'category',
          sortBy: 'name',
          rooms: ['Kitchen'],
        },
      })
      const before = {
        ...page.filter(),
      }

      page.toggleManageLayout()
      expect(page.filter()).toEqual(before)

      page.toggleManageLayout()
      expect(page.manageLayoutMode).toBe(false)
      expect(page.layoutLocked()).toBe(true)
      expect(page.filter()).toEqual(before)
      expect(accessories.setFilterState).not.toHaveBeenCalled()
    })

    it('lets the user change the grouping, sort and filters while manage layout is on', async () => {
      const page = await open({
        rooms: [
          roomOf('Kitchen', [
            makeService({ uniqueId: 'a' }),
          ]),
        ],
      })
      page.toggleManageLayout()

      page.onFilterChange({
        ...page.filter(),
        groupBy: 'bridge',
        sortBy: 'battery',
      })

      expect(page.filter().groupBy).toBe('bridge')
      expect(page.filter().sortBy).toBe('battery')
      expect(page.manageLayoutMode).toBe(true)
    })

    it('keeps manage mode when a filter is picked, and keeps the layout unlocked', async () => {
      const page = await open({
        rooms: [
          roomOf('Kitchen', [
            makeService({ uniqueId: 'a' }),
          ]),
        ],
        filter: {
          rooms: ['Kitchen'],
        },
      })

      page.toggleManageLayout()
      page.onFilterChange({
        ...page.filter(),
        rooms: ['Office'],
      })

      expect(page.manageLayoutMode).toBe(true)
      expect(page.layoutLocked()).toBe(false)
      expect(page.filter().rooms).toEqual(['Office'])
    })

    it('only allows dragging while in manage layout mode', async () => {
      const page = await open()
      const servicesGroup = dragula.createGroup.mock.calls.find(call => call[0] === 'services-bag')![1]
      const roomsGroup = dragula.createGroup.mock.calls.find(call => call[0] === 'rooms-bag')![1]
      const handle = document.createElement('div')
      handle.classList.add('drag-handle')
      const tile = document.createElement('div')

      expect(servicesGroup.moves(tile, null, tile)).toBe(false)
      expect(roomsGroup.moves(null, null, handle)).toBe(false)

      page.toggleManageLayout()

      expect(servicesGroup.moves(tile, null, tile)).toBe(true)
      expect(roomsGroup.moves(null, null, handle)).toBe(true)
    })

    it('needs the handle to drag a room', async () => {
      const page = await open()
      page.toggleManageLayout()
      const roomsGroup = dragula.createGroup.mock.calls.find(call => call[0] === 'rooms-bag')![1]

      // Rooms move by their handle only, so dragging a tile does not take the
      // whole room with it
      expect(roomsGroup.moves(null, null, document.createElement('div'))).toBe(false)
    })

    it('refuses to drag a tile marked no-drag', async () => {
      const page = await open()
      page.toggleManageLayout()
      const servicesGroup = dragula.createGroup.mock.calls.find(call => call[0] === 'services-bag')![1]
      const tile = document.createElement('div')
      tile.classList.add('no-drag')

      expect(servicesGroup.moves(tile, null, tile)).toBe(false)
    })

    it('saves the layout after a drop', async () => {
      vi.useFakeTimers()
      await open()

      dropEvents.next({})
      await vi.advanceTimersByTimeAsync(0)

      // Deferred a tick so dragula has finished mutating the model first
      expect(accessories.saveLayout).toHaveBeenCalled()
    })

    it('tears down its drag groups when the page closes', async () => {
      await open()

      TestBed.resetTestingModule()

      // The groups are registered globally, so leaving them behind would let a
      // later page drag things it should not
      expect(dragula.destroy).toHaveBeenCalledWith('rooms-bag')
      expect(dragula.destroy).toHaveBeenCalledWith('services-bag')
    })
  })

  describe('the toolbar filter', () => {
    it('applies the filter the toolbar emits, and saves it', async () => {
      const page = await open({
        rooms: [
          roomOf('Kitchen', [
            makeService({ uniqueId: 'a' }),
          ]),
        ],
      })

      page.onFilterChange({
        ...page.filter(),
        search: 'kettle',
      })

      expect(accessories.setFilterState).toHaveBeenLastCalledWith(expect.objectContaining({ search: 'kettle' }))
      expect(page.filter().search).toBe('kettle')
    })
  })

  describe('collapsing groups', () => {
    afterEach(() => {
      localStorage.clear()
    })

    it('collapses a group and remembers it', async () => {
      const page = await open({
        rooms: [
          roomOf('Kitchen', [
            makeService({ uniqueId: 'a' }),
          ]),
        ],
      })

      page.toggleGroup(page.groups()[0])

      expect(page.isCollapsed(page.groups()[0])).toBe(true)
      expect(localStorage.getItem('accessories-collapsed-v1')).toContain('room:Kitchen')
    })

    it('opens with the groups collapsed last time', async () => {
      localStorage.setItem('accessories-collapsed-v1', JSON.stringify(['room:Kitchen']))
      const page = await open({
        rooms: [
          roomOf('Kitchen', [
            makeService({ uniqueId: 'a' }),
          ]),
        ],
      })

      expect(page.isCollapsed(page.groups()[0])).toBe(true)
    })

    it('ignores saved data it cannot read', async () => {
      localStorage.setItem('accessories-collapsed-v1', '{not json')
      const page = await open({
        rooms: [
          roomOf('Kitchen', [
            makeService({ uniqueId: 'a' }),
          ]),
        ],
      })

      expect(page.isCollapsed(page.groups()[0])).toBe(false)
    })

    it('collapses every group, then expands them all', async () => {
      const page = await open({
        rooms: [
          roomOf('Kitchen', [
            makeService({ uniqueId: 'a' }),
          ]),
          roomOf('Office', [
            makeService({ uniqueId: 'b' }),
          ]),
        ],
      })

      page.toggleAllGroups()
      expect(page.allCollapsed()).toBe(true)

      page.toggleAllGroups()
      expect(page.allCollapsed()).toBe(false)
      expect(page.groups().some(group => page.isCollapsed(group))).toBe(false)
    })
  })

  describe('room badges', () => {
    it('hides the badges that are zero', async () => {
      await open({
        rooms: [
          roomOf('Kitchen', [
            makeService({ uniqueId: 'a', type: 'Switch' }),
          ]),
        ],
      })
      fixture.detectChanges()

      expect(fixture.nativeElement.querySelectorAll('.badge-summary').length).toBe(0)
    })

    it('shows the average temperature of the room', async () => {
      await open({
        rooms: [
          roomOf('Kitchen', [
            makeService({
              uniqueId: 'a',
              type: 'TemperatureSensor',
              values: { CurrentTemperature: 20 },
            }),
            makeService({
              uniqueId: 'b',
              type: 'TemperatureSensor',
              values: { CurrentTemperature: 22 },
            }),
          ]),
        ],
      })
      fixture.detectChanges()

      const badges = fixture.nativeElement.querySelectorAll('.badge-summary')
      expect(badges.length).toBe(1)
      expect(badges[0].textContent).toContain('21')
    })
  })

  describe('the rooms', () => {
    it('reads and writes the layout through the service', async () => {
      const page = await open({
        rooms: [
          { name: 'Default Room', isDefault: true, services: [] },
        ],
      })

      expect(page.rooms.map(room => room.name)).toEqual(['Default Room'])

      page.rooms = [
        { name: 'Kitchen', services: [] },
      ]
      // The service owns this so it survives navigation, and the setter is what
      // dragula's two-way binding writes through
      expect(accessories.rooms().map((room: any) => room.name)).toEqual(['Kitchen'])
    })

    it('replaces only the room that was reordered', async () => {
      const kitchen = {
        name: 'Kitchen',
        services: [
          makeService(),
        ],
      }
      const hall = { name: 'Hall', services: [] }
      const page = await open({
        rooms: [kitchen, hall],
      })

      page.onServicesReorder(kitchen, [])

      const [first, second] = accessories.rooms()
      expect(first.services).toEqual([])
      // The other room is the same object, so nothing about it re-renders
      expect(second).toBe(hall)
    })

    it('opens the add room modal', async () => {
      const page = await open()

      void page.addRoom()

      expect(modal.lastOpened()?.content).toBe(AddRoomComponent)
    })

    it('opens the support modal', async () => {
      const page = await open()

      page.openSupport()

      expect(modal.lastOpened()?.content).toBe(AccessorySupportComponent)
    })
  })

  describe('bridge names from the socket', () => {
    it('connects to both namespaces it needs', async () => {
      await open()

      // Bridge names come from the child-bridge feed, not from the accessory
      // data, so the page needs its own subscription
      expect(ws.connectToNamespace).toHaveBeenCalledWith('child-bridges')
      expect(statusIo).toBeDefined()
      expect(childIo).toBeDefined()
    })

    it('learns the child bridge names from the socket', async () => {
      const page = await open({
        childBridges: [
          { username: '0E:11:11:11:11:11', name: 'Kitchen Bridge' },
        ],
        rooms: [
          roomOf('Kitchen', [
            makeService(),
          ]),
        ],
        availableBridges: ['Kitchen Bridge'],
        filter: {
          bridges: ['Kitchen Bridge'],
        },
      })

      // The name the user gave the bridge only exists on this feed, and it is
      // what the filter matches against
      expect(page.shownCount()).toBe(1)
    })

    it('picks up a bridge renamed while the page is open', async () => {
      const page = await open({
        rooms: [
          roomOf('Kitchen', [
            makeService(),
          ]),
        ],
        availableBridges: ['Kitchen Bridge'],
        filter: {
          bridges: ['Kitchen Bridge'],
        },
      })
      expect(page.shownCount()).toBe(0)

      childIo.socket.fire('child-bridge-status-update', { username: '0E:11:11:11:11:11', name: 'Kitchen Bridge' })

      expect(page.shownCount()).toBe(1)
    })

    it('re-reads the available bridges when the accessories change', async () => {
      const page = await open({ availableBridges: [] })

      accessoryData.next([
        makeService(),
      ])
      await Promise.resolve()

      // A plugin restarting adds and removes bridges, so the filter list cannot
      // be worked out once at startup
      expect(page.availableBridges()).toBeDefined()
    })
  })

  describe('what a non-admin sees', () => {
    it('knows the user is not an admin', async () => {
      const page = await open({ admin: false })

      expect(page.isAdmin).toBe(false)
    })

    it('reports whether accessory control is switched on at all', async () => {
      expect((await open({
        env: { enableAccessories: false },
      })).enableAccessories).toBe(false)
      expect((await open()).enableAccessories).toBe(true)
    })
  })

  /**
   * Adding, renaming and deleting rooms.
   *
   * ⚠️ **Deleting a room must not delete the accessories in it.** They are moved to
   * the default room first — and if the room being deleted *is* the default, another
   * room becomes the default and takes them. Getting this wrong loses tiles from the
   * page entirely, and the layout is then saved in that state.
   */
  describe('managing the rooms', () => {
    const room = (name: string, overrides: Record<string, any> = {}) => ({
      name,
      isDefault: false,
      services: [],
      ...overrides,
    })

    async function settle() {
      for (let tick = 0; tick < 10; tick += 1) {
        await Promise.resolve()
      }
    }

    describe('adding one', () => {
      it('tells the modal which rooms already exist', async () => {
        // So it can refuse a duplicate name
        const page = await open({
          rooms: [
            room('Kitchen'),
          ],
        })

        void page.addRoom()
        await settle()

        expect(modal.lastOpened()!.content).toBe(AddRoomComponent)
        expect(modal.dataFor(ADD_ROOM_MODAL_DATA)?.existingRooms).toHaveLength(1)
      })

      it('adds the room and saves the layout', async () => {
        const page = await open({
          rooms: [
            room('Kitchen', { isDefault: true }),
          ],
        })

        void page.addRoom()
        await settle()
        modal.lastOpened()!.ref.close({ name: 'Hall', isDefault: false })
        await settle()

        expect(accessories.rooms().map((r: any) => r.name)).toEqual(['Kitchen', 'Hall'])
        expect(accessories.saveLayout).toHaveBeenCalled()
      })

      it('adds it empty, so no accessory moves into it by surprise', async () => {
        const page = await open({ rooms: [] })

        void page.addRoom()
        await settle()
        modal.lastOpened()!.ref.close({ name: 'Hall', isDefault: false })
        await settle()

        expect(accessories.rooms()[0].services).toEqual([])
      })

      it('makes it the only default when it is added as one', async () => {
        // Two default rooms would fight over every new accessory
        const page = await open({
          rooms: [
            room('Kitchen', { isDefault: true }),
          ],
        })

        void page.addRoom()
        await settle()
        modal.lastOpened()!.ref.close({ name: 'Hall', isDefault: true })
        await settle()

        expect(accessories.rooms().filter((r: any) => r.isDefault).map((r: any) => r.name)).toEqual(['Hall'])
      })

      it('leaves the layout alone when the modal is dismissed', async () => {
        const page = await open({
          rooms: [
            room('Kitchen'),
          ],
        })

        void page.addRoom()
        await settle()
        modal.lastOpened()!.ref.dismiss()
        await settle()

        expect(accessories.rooms()).toHaveLength(1)
        expect(accessories.saveLayout).not.toHaveBeenCalled()
      })

      it('adds nothing for a nameless room', async () => {
        const page = await open({
          rooms: [
            room('Kitchen'),
          ],
        })

        void page.addRoom()
        await settle()
        modal.lastOpened()!.ref.close({ name: '', isDefault: false })
        await settle()

        expect(accessories.rooms()).toHaveLength(1)
      })

      it('unlocks the layout, so the new room can be filled', async () => {
        const page = await open({
          rooms: [
            room('Kitchen'),
          ],
        })
        expect(page.layoutLocked()).toBe(true)

        void page.addRoom()
        await settle()
        modal.lastOpened()!.ref.close({ name: 'Hall', isDefault: false })
        await settle()

        expect(page.layoutLocked()).toBe(false)
      })
    })

    describe('renaming one', () => {
      it('tells the modal the room it is editing, and which one that is', async () => {
        const page = await open({
          rooms: [
            room('Kitchen'),
            room('Hall'),
          ],
        })

        void page.editRoom(1)
        await settle()

        expect(modal.lastOpened()!.content).toBe(EditRoomComponent)
        expect(modal.dataFor(EDIT_ROOM_MODAL_DATA)).toMatchObject({ roomName: 'Hall', currentRoomIndex: 1 })
      })

      it('renames it in place, keeping its accessories', async () => {
        const service = makeService()
        const page = await open({
          rooms: [
            room('Kitchen', {
              services: [service],
            }),
          ],
        })

        void page.editRoom(0)
        await settle()
        modal.lastOpened()!.ref.close({ name: 'Kitchenette', isDefault: false })
        await settle()

        expect(accessories.rooms()[0]).toMatchObject({
          name: 'Kitchenette',
          services: [service],
        })
        expect(accessories.saveLayout).toHaveBeenCalled()
      })

      it('moves the default over when a room is made the default', async () => {
        const page = await open({
          rooms: [
            room('Kitchen', { isDefault: true }),
            room('Hall'),
          ],
        })

        void page.editRoom(1)
        await settle()
        modal.lastOpened()!.ref.close({ name: 'Hall', isDefault: true })
        await settle()

        expect(accessories.rooms().map((r: any) => r.isDefault)).toEqual([false, true])
      })

      it('does nothing for a room index that is not there', async () => {
        const page = await open({
          rooms: [
            room('Kitchen'),
          ],
        })

        await page.editRoom(5)

        expect(modal.opened).toEqual([])
      })

      it('leaves the room alone when the modal is dismissed', async () => {
        const page = await open({
          rooms: [
            room('Kitchen'),
          ],
        })

        void page.editRoom(0)
        await settle()
        modal.lastOpened()!.ref.dismiss()
        await settle()

        expect(accessories.rooms()[0].name).toBe('Kitchen')
        expect(accessories.saveLayout).not.toHaveBeenCalled()
      })

      it('ignores a blank name', async () => {
        const page = await open({
          rooms: [
            room('Kitchen'),
          ],
        })

        void page.editRoom(0)
        await settle()
        modal.lastOpened()!.ref.close({ name: '', isDefault: false })
        await settle()

        expect(accessories.rooms()[0].name).toBe('Kitchen')
      })
    })

    describe('deleting one', () => {
      it('moves its accessories into the default room', async () => {
        // ⚠️ The whole point: they would otherwise vanish from the page, and the
        // layout would be saved without them
        const service = makeService()
        const page = await open({
          rooms: [
            room('Kitchen', { isDefault: true }),
            room('Spare', {
              services: [service],
            }),
          ],
        })

        void page.editRoom(1)
        await settle()
        modal.lastOpened()!.ref.close({ delete: true })
        await settle()

        expect(accessories.rooms().map((r: any) => r.name)).toEqual(['Kitchen'])
        expect(accessories.rooms()[0].services).toEqual([service])
      })

      it('hands the accessories of a deleted default room to another room', async () => {
        const service = makeService()
        const page = await open({
          rooms: [
            room('Kitchen', {
              isDefault: true,
              services: [service],
            }),
            room('Hall'),
          ],
        })

        void page.editRoom(0)
        await settle()
        modal.lastOpened()!.ref.close({ delete: true })
        await settle()

        expect(accessories.rooms().map((r: any) => r.name)).toEqual(['Hall'])
        expect(accessories.rooms()[0].services).toEqual([service])
      })

      it('makes the receiving room the new default', async () => {
        // Something has to be the default, or the next new accessory has nowhere
        // to land
        const page = await open({
          rooms: [
            room('Kitchen', { isDefault: true }),
            room('Hall'),
          ],
        })

        void page.editRoom(0)
        await settle()
        modal.lastOpened()!.ref.close({ delete: true })
        await settle()

        expect(accessories.rooms()[0]).toMatchObject({ name: 'Hall', isDefault: true })
      })

      it('leaves the default where it is when deleting another room', async () => {
        const page = await open({
          rooms: [
            room('Kitchen', { isDefault: true }),
            room('Spare'),
          ],
        })

        void page.editRoom(1)
        await settle()
        modal.lastOpened()!.ref.close({ delete: true })
        await settle()

        expect(accessories.rooms()[0]).toMatchObject({ name: 'Kitchen', isDefault: true })
      })

      it('copes with a layout that has no default room at all', async () => {
        // Older layouts predate the default-room flag
        const service = makeService()
        const page = await open({
          rooms: [
            room('Kitchen'),
            room('Spare', {
              services: [service],
            }),
          ],
        })

        void page.editRoom(1)
        await settle()
        modal.lastOpened()!.ref.close({ delete: true })
        await settle()

        expect(accessories.rooms()[0].services).toEqual([service])
      })

      it('saves the layout afterwards', async () => {
        const page = await open({
          rooms: [
            room('Kitchen', { isDefault: true }),
            room('Spare'),
          ],
        })

        void page.editRoom(1)
        await settle()
        modal.lastOpened()!.ref.close({ delete: true })
        await settle()

        expect(accessories.saveLayout).toHaveBeenCalled()
      })

      it('does not rename anything on the way out', async () => {
        const page = await open({
          rooms: [
            room('Kitchen', { isDefault: true }),
            room('Spare'),
          ],
        })

        void page.editRoom(1)
        await settle()
        modal.lastOpened()!.ref.close({ delete: true })
        await settle()

        expect(accessories.rooms().map((r: any) => r.name)).toEqual(['Kitchen'])
      })
    })
  })

  /**
   * Keeping the bridge filter in step with what is on the page.
   *
   * ⚠️ **The bridge names arrive after the accessories do.** They come over a
   * separate socket, so an early pass sees fewer bridges than the last one — and
   * shrinking the list would deselect bridges the user is filtering by, hiding
   * their accessories for no reason. The list therefore only ever grows.
   */
  describe('the list of bridges to filter by', () => {
    const service = (username: string, name: string) => makeService({
      instance: { username, name },
    })
    const room = (services: any[]) => ({ name: 'Kitchen', isDefault: true, services })

    /** Recompute the list from the current rooms. */
    function recompute(page: any) {
      page.updateAvailableBridges()
    }

    it('names a child bridge from the child-bridge feed and the main bridge from its advertised name', async () => {
      const page = await open({
        rooms: [
          room([
            service('0E:11:11:11:11:11', 'homebridge'),
            service('0E:22:22:22:22:22', 'Hue Bridge 3F2A'),
          ]),
        ],
        childBridges: [
          { username: '0E:22:22:22:22:22', name: 'Hue' },
        ],
      })

      recompute(page)

      expect(accessories.availableBridges()).toEqual(['homebridge', 'Hue'])
      const names = page.labelledRooms()[0].services.map((s: any) => s.instance.name)
      expect(names).toEqual(['homebridge', 'Hue'])
    })

    it('lists the bridge each accessory belongs to', async () => {
      const page = await open({
        rooms: [
          room([
            service('0E:11:11:11:11:11', 'Homebridge'),
            service('0E:22:22:22:22:22', 'Kitchen Bridge'),
          ]),
        ],
      })

      recompute(page)

      expect(accessories.availableBridges()).toEqual(['Homebridge', 'Kitchen Bridge'])
    })

    it('puts homebridge itself first, then the rest by name', async () => {
      // It is the one everybody has, and the list reads better with it at the top
      const page = await open({
        rooms: [
          room([
            service('0E:33:33:33:33:33', 'Zebra Bridge'),
            service('0E:11:11:11:11:11', 'Homebridge'),
            service('0E:22:22:22:22:22', 'Apple Bridge'),
          ]),
        ],
      })

      recompute(page)

      expect(accessories.availableBridges()).toEqual(['Homebridge', 'Apple Bridge', 'Zebra Bridge'])
    })

    it('names each bridge by the name it advertises', async () => {
      const page = await open({
        rooms: [
          room([
            service('0E:22:22:22:22:22', 'Kitchen Bridge'),
          ]),
        ],
      })

      recompute(page)

      expect(accessories.availableBridges()).toEqual(['Kitchen Bridge'])
    })

    it('lists a bridge once however many accessories it has', async () => {
      const page = await open({
        rooms: [
          room([
            service('0E:11:11:11:11:11', 'Homebridge'),
            service('0E:11:11:11:11:11', 'Homebridge'),
          ]),
        ],
      })

      recompute(page)

      expect(accessories.availableBridges()).toEqual(['Homebridge'])
    })

    it('ignores an accessory with no bridge attached', async () => {
      const page = await open({
        rooms: [
          room([
            makeService({ instance: undefined }),
          ]),
        ],
      })

      recompute(page)

      expect(accessories.availableBridges()).toEqual([])
    })

    it('lists the bridges now present, dropping one that has gone', async () => {
      // ⚠️ Only when the new list is not *shorter* than the old one — a shorter list
      // is treated as the names not having arrived yet (see the case below), so a
      // bridge that really has gone is dropped when another appears in its place
      const page = await open({
        rooms: [
          room([
            service('0E:11:11:11:11:11', 'Apple Bridge'),
            service('0E:33:33:33:33:33', 'New Bridge'),
          ]),
        ],
        availableBridges: ['Apple Bridge', 'Gone Bridge'],
      })

      recompute(page)

      expect(accessories.availableBridges()).toEqual(['Apple Bridge', 'New Bridge'])
    })

    it('keeps a bridge in the list when the new pass is shorter', async () => {
      // The other half of the same rule: nothing is removed on a shrinking pass,
      // because the names may simply not have arrived yet
      const page = await open({
        rooms: [
          room([
            service('0E:11:11:11:11:11', 'Apple Bridge'),
          ]),
        ],
        availableBridges: ['Apple Bridge', 'Kitchen Bridge'],
      })

      recompute(page)

      expect(accessories.availableBridges()).toEqual(['Apple Bridge', 'Kitchen Bridge'])
    })

    it('ignores a pass that sees fewer bridges than the last one', async () => {
      // ⚠️ The race: the names arrive on their own socket, so an early pass can see
      // fewer bridges. Shrinking here would deselect bridges the user is filtering
      // by and hide their accessories
      const page = await open({
        rooms: [
          room([
            service('0E:11:11:11:11:11', 'Homebridge'),
          ]),
        ],
        availableBridges: ['Homebridge', 'Kitchen Bridge'],
      })

      recompute(page)

      expect(accessories.availableBridges()).toEqual(['Homebridge', 'Kitchen Bridge'])
    })

    it('changes nothing when the list is the same as before', async () => {
      const page = await open({
        rooms: [
          room([
            service('0E:11:11:11:11:11', 'Homebridge'),
          ]),
        ],
        availableBridges: ['Homebridge'],
      })

      recompute(page)

      expect(accessories.availableBridges()).toEqual(['Homebridge'])
    })
  })

  describe('moving tiles', () => {
    it('shows no per-tile move menu on the tiles, and moves tiles by drag only', async () => {
      await open({
        rooms: [
          roomOf('Kitchen', [
            makeService({ uniqueId: 'kettle' }),
          ]),
          roomOf('Office', []),
        ],
        filter: {
          groupBy: 'room',
          rooms: ['Kitchen'],
        },
      })

      expect(fixture.nativeElement.querySelector('.accessory-move')).toBeNull()
      expect(fixture.nativeElement.querySelector('.accessory-move-toggle')).toBeNull()
    })

    it('drops a tile into another room group and moves it by its uniqueId', async () => {
      const page = await open({
        rooms: [
          roomOf('Kitchen', [
            makeService({ uniqueId: 'kettle' }),
          ]),
          roomOf('Office', []),
        ],
        filter: {
          groupBy: 'room',
          rooms: ['Kitchen'],
        },
      })
      const from = { data: 'Kitchen' }
      const to = { data: 'Office' }

      page.onRoomDrop({
        previousContainer: from,
        container: to,
        item: { data: 'kettle' },
      } as any)

      expect(accessories.moveServicesToRoom).toHaveBeenCalledTimes(1)
      expect(accessories.moveServicesToRoom).toHaveBeenCalledWith(['kettle'], 'Office')
    })

    it('ignores a drop within the same room group', async () => {
      const page = await open({
        rooms: [
          roomOf('Kitchen', [
            makeService({ uniqueId: 'kettle' }),
            makeService({ uniqueId: 'ceiling' }),
          ]),
        ],
        filter: {
          groupBy: 'room',
          rooms: ['Kitchen'],
        },
      })
      const group = { data: 'Kitchen' }

      page.onRoomDrop({
        previousContainer: group,
        container: group,
        item: { data: 'kettle' },
      } as any)

      expect(accessories.moveServicesToRoom).not.toHaveBeenCalled()
    })

    it('does not allow drops between rooms while no filter is on', async () => {
      const page = await open({
        rooms: [
          roomOf('Kitchen', [
            makeService({ uniqueId: 'kettle' }),
          ]),
          roomOf('Office', []),
        ],
        filter: { groupBy: 'room' },
      })

      expect(page.canDragBetweenRooms()).toBe(false)
      page.onRoomDrop({
        previousContainer: { data: 'Kitchen' },
        container: { data: 'Office' },
        item: { data: 'kettle' },
      } as any)

      expect(accessories.moveServicesToRoom).not.toHaveBeenCalled()
    })

    it('keeps the filtered drag off the normal view while in manage layout mode', async () => {
      const page = await open({
        rooms: [
          roomOf('Kitchen', [
            makeService({ uniqueId: 'kettle' }),
          ]),
          roomOf('Office', []),
        ],
        filter: {
          groupBy: 'room',
          rooms: ['Kitchen'],
        },
      })
      expect(page.canDragBetweenRooms()).toBe(true)

      page.manageLayoutMode = true

      expect(page.canDragBetweenRooms()).toBe(false)
    })
  })

  describe('manage layout with a filter', () => {
    /** Kitchen has a hidden tile between visible ones; the filter keeps Kitchen and Office in view */
    async function openFiltered() {
      return open({
        rooms: [
          roomOf('Kitchen', [
            makeService({ uniqueId: 'a' }),
            makeService({ uniqueId: 'h', hidden: true }),
            makeService({ uniqueId: 'b' }),
            makeService({ uniqueId: 'c' }),
          ]),
          roomOf('Hall', [
            makeService({ uniqueId: 'hall-1' }),
          ]),
          roomOf('Office', [
            makeService({ uniqueId: 'x' }),
            makeService({ uniqueId: 'y' }),
          ]),
        ],
        filter: {
          groupBy: 'room',
          rooms: ['Kitchen', 'Office'],
        },
      })
    }

    it('places a tile reordered within a room by its visible neighbours', async () => {
      const page = await openFiltered()
      page.toggleManageLayout()
      const group = { data: 'Kitchen' }

      // Visible Kitchen is a, b, c. c moves to the top.
      page.onRoomDrop({
        previousContainer: group,
        container: group,
        item: { data: 'c' },
        previousIndex: 2,
        currentIndex: 0,
      } as any)

      expect(accessories.placeService).toHaveBeenCalledWith('c', 'Kitchen', 'a', null)
      expect(accessories.moveServicesToRoom).not.toHaveBeenCalled()
    })

    it('places a tile moved into another room between its visible neighbours', async () => {
      const page = await openFiltered()
      page.toggleManageLayout()

      // Visible Office is x, y. a is dropped at position 1, between x and y.
      page.onRoomDrop({
        previousContainer: { data: 'Kitchen' },
        container: { data: 'Office' },
        item: { data: 'a' },
        previousIndex: 0,
        currentIndex: 1,
      } as any)

      expect(accessories.placeService).toHaveBeenCalledWith('a', 'Office', 'y', 'x')
    })

    it('reorders a room by its visible neighbours', async () => {
      const page = await openFiltered()
      page.toggleManageLayout()

      // Every room is a row now, Kitchen, Hall, Office. Kitchen moves to the end, after Office.
      page.onRoomReorder({
        previousIndex: 0,
        currentIndex: 2,
      } as any)

      expect(accessories.placeRoom).toHaveBeenCalledWith('Kitchen', null, 'Office')
    })

    it('uses dragula with no filter, and CDK with a filter, never both', async () => {
      const page = await open({
        rooms: [
          roomOf('Kitchen', [
            makeService({ uniqueId: 'a' }),
          ]),
        ],
      })
      const servicesGroup = dragula.createGroup.mock.calls.find(call => call[0] === 'services-bag')![1]
      const tile = document.createElement('div')

      page.toggleManageLayout()
      expect(page.usesDragula()).toBe(true)
      expect(page.manageFiltered()).toBe(false)
      expect(page.tilesDraggable()).toBe(false)
      expect(servicesGroup.moves(tile, null, tile)).toBe(true)

      page.onFilterChange({
        ...page.filter(),
        rooms: ['Kitchen'],
      })
      expect(page.usesDragula()).toBe(false)
      expect(page.manageFiltered()).toBe(true)
      expect(page.tilesDraggable()).toBe(true)
      expect(servicesGroup.moves(tile, null, tile)).toBe(false)
    })

    it('renders every room in filtered manage mode, including empty ones', async () => {
      const page = await openFiltered()
      page.toggleManageLayout()
      fixture.detectChanges()

      // Hall has only filtered-out services, so it has no visible tiles but is still a row
      expect(fixture.nativeElement.querySelectorAll('section.accessory-group').length).toBe(3)
      expect(fixture.nativeElement.textContent).toContain('accessories.manage_no_matches')
    })

    it('drops a tile into an empty room, placed at the end of its full list', async () => {
      const page = await openFiltered()
      page.toggleManageLayout()

      page.onRoomDrop({
        previousContainer: { data: 'Kitchen' },
        container: { data: 'Hall' },
        item: { data: 'a' },
        previousIndex: 0,
        currentIndex: 0,
      } as any)

      expect(accessories.placeService).toHaveBeenCalledWith('a', 'Hall', null, null)
    })

    it('reorders an empty room by its neighbours', async () => {
      const page = await openFiltered()
      page.toggleManageLayout()

      // Rows are Kitchen, Hall, Office. Hall moves to the top, before Kitchen.
      page.onRoomReorder({
        previousIndex: 1,
        currentIndex: 0,
      } as any)

      expect(accessories.placeRoom).toHaveBeenCalledWith('Hall', 'Kitchen', null)
    })
  })

  describe('manage layout views', () => {
    /** Two rooms, one with two tiles, so a drop has something to move */
    async function openView(filter: Record<string, any>) {
      return open({
        rooms: [
          roomOf('Kitchen', [
            makeService({ uniqueId: 'kettle' }),
            makeService({ uniqueId: 'ceiling' }),
          ]),
          roomOf('Office', []),
        ],
        filter,
      })
    }

    it('uses dragula for room grouping in manual sort with no filter, and shows the layout hint', async () => {
      const page = await openView({ groupBy: 'room', sortBy: 'manual' })
      const servicesGroup = dragula.createGroup.mock.calls.find(call => call[0] === 'services-bag')![1]
      const tile = document.createElement('div')

      page.toggleManageLayout()
      fixture.detectChanges()

      expect(page.manageView()).toBe('dragula')
      expect(page.usesDragula()).toBe(true)
      expect(page.manageFiltered()).toBe(false)
      expect(page.manageSorted()).toBe(false)
      expect(page.tilesDraggable()).toBe(false)
      expect(servicesGroup.moves(tile, null, tile)).toBe(true)
      expect(fixture.nativeElement.textContent).toContain('accessories.manage_layout_hint')
    })

    it('uses CDK with every room and room reordering for room grouping in manual sort with a filter', async () => {
      const page = await openView({
        groupBy: 'room',
        sortBy: 'manual',
        rooms: ['Kitchen'],
      })
      const servicesGroup = dragula.createGroup.mock.calls.find(call => call[0] === 'services-bag')![1]
      const tile = document.createElement('div')

      page.toggleManageLayout()
      fixture.detectChanges()

      expect(page.manageView()).toBe('filtered')
      expect(page.usesDragula()).toBe(false)
      expect(page.manageFiltered()).toBe(true)
      expect(page.tilesDraggable()).toBe(true)
      expect(page.displayGroups().map(group => group.key)).toEqual(['Kitchen', 'Office'])
      expect(servicesGroup.moves(tile, null, tile)).toBe(false)
      expect(fixture.nativeElement.textContent).toContain('accessories.manage_filtered_hint')
    })

    it('moves tiles between rooms only, with room reordering off, for room grouping in another sort', async () => {
      const page = await openView({ groupBy: 'room', sortBy: 'name' })
      const servicesGroup = dragula.createGroup.mock.calls.find(call => call[0] === 'services-bag')![1]
      const tile = document.createElement('div')

      page.toggleManageLayout()
      fixture.detectChanges()

      expect(page.manageView()).toBe('sorted')
      expect(page.usesDragula()).toBe(false)
      expect(page.manageFiltered()).toBe(false)
      expect(page.manageSorted()).toBe(true)
      expect(page.tilesDraggable()).toBe(true)
      expect(servicesGroup.moves(tile, null, tile)).toBe(false)
      expect(fixture.nativeElement.textContent).toContain('accessories.manage_sorted_hint')
    })

    it('disables tile drag when not grouped by room, and shows the group-by-room hint', async () => {
      const page = await openView({ groupBy: 'category' })

      page.toggleManageLayout()
      fixture.detectChanges()

      expect(page.manageView()).toBe('ungrouped')
      expect(page.usesDragula()).toBe(false)
      expect(page.tilesDraggable()).toBe(false)
      expect(page.manageRoomRows()).toBe(false)
      expect(fixture.nativeElement.textContent).toContain('accessories.manage_ungrouped_hint')
    })

    it('moves a tile into another room when sorted, appending it, with one call', async () => {
      const page = await openView({ groupBy: 'room', sortBy: 'name' })
      page.toggleManageLayout()

      page.onRoomDrop({
        previousContainer: { data: 'Kitchen' },
        container: { data: 'Office' },
        item: { data: 'kettle' },
      } as any)

      expect(accessories.moveServicesToRoom).toHaveBeenCalledTimes(1)
      expect(accessories.moveServicesToRoom).toHaveBeenCalledWith(['kettle'], 'Office')
      expect(accessories.placeService).not.toHaveBeenCalled()
    })

    it('does nothing for a drop within the same room when sorted', async () => {
      const page = await openView({ groupBy: 'room', sortBy: 'name' })
      page.toggleManageLayout()
      const group = { data: 'Kitchen' }

      page.onRoomDrop({
        previousContainer: group,
        container: group,
        item: { data: 'kettle' },
        previousIndex: 0,
        currentIndex: 1,
      } as any)

      expect(accessories.moveServicesToRoom).not.toHaveBeenCalled()
      expect(accessories.placeService).not.toHaveBeenCalled()
    })

    it('does not reorder rooms when sorted', async () => {
      const page = await openView({ groupBy: 'room', sortBy: 'name' })
      page.toggleManageLayout()

      page.onRoomReorder({ previousIndex: 0, currentIndex: 1 } as any)

      expect(accessories.placeRoom).not.toHaveBeenCalled()
    })

    it('does not move tiles between groups when not grouped by room, even in manage layout', async () => {
      const page = await openView({ groupBy: 'category' })
      page.toggleManageLayout()

      page.onRoomDrop({
        previousContainer: { data: 'Kitchen' },
        container: { data: 'Office' },
        item: { data: 'kettle' },
      } as any)

      expect(accessories.moveServicesToRoom).not.toHaveBeenCalled()
      expect(accessories.placeService).not.toHaveBeenCalled()
    })
  })
})

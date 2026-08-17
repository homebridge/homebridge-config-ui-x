import type { FakeIoNamespace, FakeModalService, FakeSettings, FakeWs } from '@/testing'

import { NO_ERRORS_SCHEMA, signal } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { provideRouter } from '@angular/router'
import { TranslatePipe } from '@ngx-translate/core'
import { DragulaService } from 'ng2-dragula'
import { Subject } from 'rxjs'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { AccessoriesService } from '@/app/core/accessories/accessories.service'
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
 * The fix is that the two are mutually exclusive - manage-layout mode shows
 * everything and suspends the filter, and picking a filter leaves manage-layout
 * mode. That interaction is what most of these specs are about, along with the
 * bridge names, which come from the child-bridge socket rather than the
 * accessory data and so can be missing.
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

  /**
   * Build the page.
   * @param options - how to set it up
   * @param options.rooms - the room layout the service reports
   * @param options.availableBridges - the bridges the filter can offer
   * @param options.selectedBridges - the filter's starting state
   * @param options.bridgeNames - the username-to-name map the service holds
   * @param options.env - settings env overrides
   * @param options.admin - whether the signed-in user is an admin
   * @param options.childBridges - what the child-bridge socket reports
   */
  async function open(options: {
    rooms?: any[]
    availableBridges?: string[]
    selectedBridges?: string[] | null
    bridgeNames?: Map<string, string>
    env?: Record<string, any>
    admin?: boolean
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
      rooms: signal(options.rooms ?? []),
      availableBridges: signal(options.availableBridges ?? []),
      selectedBridges: signal<string[] | null>(options.selectedBridges ?? null),
      bridgeUsernameToNameMap: options.bridgeNames ?? new Map<string, string>(),
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
        provideFakes({ settings, ws, modal, toastr: toastrStub(), auth: makeAuth({ user: { admin: options.admin ?? true } }) }),
        { provide: AccessoriesService, useValue: accessories },
        { provide: DragulaService, useValue: dragula },
      ],
    })

    // The tiles are covered by their own routing spec, and dragula needs a real
    // layout to do anything useful
    TestBed.overrideComponent(AccessoriesComponent, {
      set: { imports: [TranslatePipe], schemas: [NO_ERRORS_SCHEMA] },
    })

    const fixture = TestBed.createComponent(AccessoriesComponent)
    fixture.detectChanges()
    await fixture.whenStable()

    for (let tick = 0; tick < 10; tick += 1) {
      await Promise.resolve()
    }

    return fixture.componentInstance
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

    it('shows every bridge the first time the page is opened', async () => {
      const page = await open({ availableBridges: ['Homebridge', 'Hue'], selectedBridges: null })

      // A brand new user has never chosen a filter, and an empty selection means
      // nothing at all is shown
      expect(page.selectedBridges()).toEqual(['Homebridge', 'Hue'])
    })

    it('keeps a filter the user chose earlier', async () => {
      const page = await open({ availableBridges: ['Homebridge', 'Hue'], selectedBridges: ['Hue'] })

      // The selection lives on the service so it survives navigating away and
      // back
      expect(page.selectedBridges()).toEqual(['Hue'])
    })

    it('starts with the layout locked', async () => {
      const page = await open()

      // Rooms and tiles are only draggable once the user asks for it, or a
      // stray touch on a phone reorders their home
      expect(page.layoutLocked()).toBe(true)
      expect(page.manageLayoutMode).toBe(false)
    })

    it('hides hidden accessories to begin with', async () => {
      const page = await open()

      expect(page.hideHidden()).toBe(true)
    })

    it('offers the filter only when there is something to filter', async () => {
      expect((await open({ availableBridges: [] })).shouldShowFilters()).toBe(false)
      expect((await open({ availableBridges: ['Homebridge'] })).shouldShowFilters()).toBe(true)
    })

    it('hides the filter when no plugins are installed', async () => {
      const page = await open({ availableBridges: ['Homebridge'], env: { hasInstalledPlugins: false } })

      expect(page.shouldShowFilters()).toBe(false)
    })

    it('stops the feed when the page closes', async () => {
      await open()

      TestBed.resetTestingModule()

      expect(accessories.stop).toHaveBeenCalled()
    })
  })

  describe('deciding which tiles to show', () => {
    it('shows an accessory from a selected bridge', async () => {
      const page = await open({ availableBridges: ['Homebridge'], selectedBridges: ['Homebridge'] })

      expect(page.shouldDisplayService(makeService())).toBe(true)
    })

    it('hides an accessory from a bridge that is filtered out', async () => {
      const page = await open({ availableBridges: ['Homebridge', 'Hue'], selectedBridges: ['Hue'] })

      expect(page.shouldDisplayService(makeService())).toBe(false)
    })

    it('hides everything when no bridge is selected', async () => {
      const page = await open({ availableBridges: ['Homebridge'], selectedBridges: [] })
      page.selectedBridges.set([])

      expect(page.shouldDisplayService(makeService())).toBe(false)
    })

    it('shows everything before a filter has been decided', async () => {
      const page = await open({ availableBridges: [] })
      page.selectedBridges.set(null)

      expect(page.shouldDisplayService(makeService())).toBe(true)
    })

    it('matches on the custom bridge name rather than the reported one', async () => {
      const page = await open({
        availableBridges: ['Kitchen Bridge'],
        selectedBridges: ['Kitchen Bridge'],
        bridgeNames: new Map([['0E:11:11:11:11:11', 'Kitchen Bridge']]),
      })

      // The bridge name in the filter is the one from the child-bridge socket,
      // which is what the user renamed it to; the accessory only knows the
      // original
      expect(page.shouldDisplayService(makeService())).toBe(true)
    })

    it('hides a hidden accessory', async () => {
      const page = await open({ availableBridges: ['Homebridge'], selectedBridges: ['Homebridge'] })

      expect(page.shouldDisplayService(makeService({ hidden: true }))).toBe(false)
    })

    it('shows a hidden accessory once the user asks for it', async () => {
      const page = await open({ availableBridges: ['Homebridge'], selectedBridges: ['Homebridge'] })
      page.hideHidden.set(false)

      expect(page.shouldDisplayService(makeService({ hidden: true }))).toBe(true)
    })

    it('shows an accessory with no bridge of its own', async () => {
      const page = await open({ availableBridges: ['Homebridge'], selectedBridges: [] })

      // Nothing to filter it by, so filtering it out would make it unreachable
      expect(page.shouldDisplayService(makeService({ instance: undefined }))).toBe(true)
    })

    it('shows absolutely everything in manage layout mode', async () => {
      const page = await open({ availableBridges: ['Homebridge', 'Hue'], selectedBridges: ['Hue'] })

      page.toggleManageLayout()

      // The heart of #2790: the dragula model and the DOM have to stay 1-to-1,
      // and a hidden tile breaks that, so every filter is suspended here
      expect(page.shouldDisplayService(makeService())).toBe(true)
      expect(page.shouldDisplayService(makeService({ hidden: true }))).toBe(true)
    })
  })

  describe('manage layout mode', () => {
    it('unlocks the layout and remembers the filter', async () => {
      const page = await open({ availableBridges: ['Homebridge', 'Hue'], selectedBridges: ['Hue'] })

      page.toggleManageLayout()

      expect(page.manageLayoutMode).toBe(true)
      expect(page.layoutLocked()).toBe(false)
    })

    it('puts the filter back when the user leaves it', async () => {
      const page = await open({ availableBridges: ['Homebridge', 'Hue'], selectedBridges: ['Hue'] })

      page.toggleManageLayout()
      page.toggleManageLayout()

      // Rearranging rooms is not meant to lose the filter the user was working
      // with beforehand
      expect(page.selectedBridges()).toEqual(['Hue'])
      expect(page.layoutLocked()).toBe(true)
      expect(page.manageLayoutMode).toBe(false)
    })

    it('shows no bridge as selected while rearranging', async () => {
      const page = await open({ availableBridges: ['Homebridge', 'Hue'], selectedBridges: ['Hue'] })

      page.toggleManageLayout()

      // The filter is suspended rather than changed, so showing a tick would
      // claim a filter that is not being applied
      expect(page.isBridgeSelected('Hue')).toBe(false)
      expect(page.isShowingAllBridges).toBe(false)
    })

    it('leaves manage mode when a bridge is picked from the filter', async () => {
      const page = await open({ availableBridges: ['Homebridge', 'Hue'], selectedBridges: ['Hue'] })
      page.toggleManageLayout()

      page.toggleBridge('Homebridge')

      // Picking a filter is the user saying they are done rearranging; carrying
      // on with a filter applied is the state that reorders the wrong accessory
      expect(page.manageLayoutMode).toBe(false)
      expect(page.selectedBridges()).toEqual(['Homebridge'])
      expect(page.layoutLocked()).toBe(true)
    })

    it('leaves manage mode when all bridges are picked', async () => {
      const page = await open({ availableBridges: ['Homebridge', 'Hue'], selectedBridges: ['Hue'] })
      page.toggleManageLayout()

      page.clearBridgeFilter()

      expect(page.manageLayoutMode).toBe(false)
      expect(page.selectedBridges()).toEqual(['Homebridge', 'Hue'])
      expect(page.layoutLocked()).toBe(true)
    })

    it('does not restore the old filter when leaving through the filter', async () => {
      const page = await open({ availableBridges: ['Homebridge', 'Hue'], selectedBridges: ['Hue'] })
      page.toggleManageLayout()
      page.toggleBridge('Homebridge')

      page.toggleManageLayout()
      page.toggleManageLayout()

      // The remembered selection is cleared on that exit, so a later round trip
      // restores what the user last chose rather than something older
      expect(page.selectedBridges()).toEqual(['Homebridge'])
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

  describe('the bridge filter', () => {
    it('adds and removes a bridge', async () => {
      const page = await open({ availableBridges: ['Homebridge', 'Hue'], selectedBridges: ['Homebridge'] })

      page.toggleBridge('Hue')
      expect(page.selectedBridges()).toEqual(['Homebridge', 'Hue'])

      page.toggleBridge('Homebridge')
      expect(page.selectedBridges()).toEqual(['Hue'])
    })

    it('reports which bridges are selected', async () => {
      const page = await open({ availableBridges: ['Homebridge', 'Hue'], selectedBridges: ['Hue'] })

      expect(page.isBridgeSelected('Hue')).toBe(true)
      expect(page.isBridgeSelected('Homebridge')).toBe(false)
    })

    it('knows when everything is shown', async () => {
      const page = await open({ availableBridges: ['Homebridge', 'Hue'], selectedBridges: ['Homebridge', 'Hue'] })

      expect(page.isShowingAllBridges).toBe(true)
    })

    it('does not call an empty list of bridges "all"', async () => {
      const page = await open({ availableBridges: [], selectedBridges: [] })

      // With nothing to select, "all bridges" would light up on a page showing
      // no filter at all
      expect(page.isShowingAllBridges).toBe(false)
    })

    it('unselects everything when all are already selected', async () => {
      const page = await open({ availableBridges: ['Homebridge', 'Hue'], selectedBridges: ['Homebridge', 'Hue'] })

      page.clearBridgeFilter()

      expect(page.selectedBridges()).toEqual([])
    })

    it('selects everything when only some are selected', async () => {
      const page = await open({ availableBridges: ['Homebridge', 'Hue'], selectedBridges: ['Hue'] })

      page.clearBridgeFilter()

      expect(page.selectedBridges()).toEqual(['Homebridge', 'Hue'])
    })

    it('locks the layout again whenever the filter changes', async () => {
      const page = await open({ availableBridges: ['Homebridge', 'Hue'], selectedBridges: ['Hue'] })
      page.toggleLayoutLock()
      expect(page.layoutLocked()).toBe(false)

      page.toggleBridge('Homebridge')

      // An unlocked layout plus an active filter is exactly the combination that
      // reorders the wrong accessory
      expect(page.layoutLocked()).toBe(true)
    })

    it('locks the layout again when the filter is cleared', async () => {
      const page = await open({ availableBridges: ['Homebridge', 'Hue'], selectedBridges: ['Hue'] })
      page.toggleLayoutLock()

      page.clearBridgeFilter()

      expect(page.layoutLocked()).toBe(true)
    })
  })

  describe('the rooms', () => {
    it('reads and writes the layout through the service', async () => {
      const page = await open({ rooms: [{ name: 'Default Room', isDefault: true, services: [] }] })

      expect(page.rooms.map(room => room.name)).toEqual(['Default Room'])

      page.rooms = [{ name: 'Kitchen', services: [] }]
      // The service owns this so it survives navigation, and the setter is what
      // dragula's two-way binding writes through
      expect(accessories.rooms().map((room: any) => room.name)).toEqual(['Kitchen'])
    })

    it('replaces only the room that was reordered', async () => {
      const kitchen = { name: 'Kitchen', services: [makeService()] }
      const hall = { name: 'Hall', services: [] }
      const page = await open({ rooms: [kitchen, hall] })

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
        childBridges: [{ username: '0E:11:11:11:11:11', name: 'Kitchen Bridge' }],
        availableBridges: ['Kitchen Bridge'],
        selectedBridges: ['Kitchen Bridge'],
      })

      // The name the user gave the bridge only exists on this feed, and it is
      // what the filter matches against
      expect(page.shouldDisplayService(makeService())).toBe(true)
    })

    it('picks up a bridge renamed while the page is open', async () => {
      const page = await open({ availableBridges: ['Kitchen Bridge'], selectedBridges: ['Kitchen Bridge'] })

      childIo.socket.fire('child-bridge-status-update', { username: '0E:11:11:11:11:11', name: 'Kitchen Bridge' })

      expect(page.shouldDisplayService(makeService())).toBe(true)
    })

    it('re-reads the available bridges when the accessories change', async () => {
      const page = await open({ availableBridges: [] })

      accessoryData.next([makeService()])
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
      expect((await open({ env: { enableAccessories: false } })).enableAccessories).toBe(false)
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
        const page = await open({ rooms: [room('Kitchen')] })

        void page.addRoom()
        await settle()

        expect(modal.lastOpened()!.content).toBe(AddRoomComponent)
        expect(modal.dataFor(ADD_ROOM_MODAL_DATA)?.existingRooms).toHaveLength(1)
      })

      it('adds the room and saves the layout', async () => {
        const page = await open({ rooms: [room('Kitchen', { isDefault: true })] })

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
        const page = await open({ rooms: [room('Kitchen', { isDefault: true })] })

        void page.addRoom()
        await settle()
        modal.lastOpened()!.ref.close({ name: 'Hall', isDefault: true })
        await settle()

        expect(accessories.rooms().filter((r: any) => r.isDefault).map((r: any) => r.name)).toEqual(['Hall'])
      })

      it('leaves the layout alone when the modal is dismissed', async () => {
        const page = await open({ rooms: [room('Kitchen')] })

        void page.addRoom()
        await settle()
        modal.lastOpened()!.ref.dismiss()
        await settle()

        expect(accessories.rooms()).toHaveLength(1)
        expect(accessories.saveLayout).not.toHaveBeenCalled()
      })

      it('adds nothing for a nameless room', async () => {
        const page = await open({ rooms: [room('Kitchen')] })

        void page.addRoom()
        await settle()
        modal.lastOpened()!.ref.close({ name: '', isDefault: false })
        await settle()

        expect(accessories.rooms()).toHaveLength(1)
      })

      it('unlocks the layout, so the new room can be filled', async () => {
        const page = await open({ rooms: [room('Kitchen')] })
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
        const page = await open({ rooms: [room('Kitchen'), room('Hall')] })

        void page.editRoom(1)
        await settle()

        expect(modal.lastOpened()!.content).toBe(EditRoomComponent)
        expect(modal.dataFor(EDIT_ROOM_MODAL_DATA)).toMatchObject({ roomName: 'Hall', currentRoomIndex: 1 })
      })

      it('renames it in place, keeping its accessories', async () => {
        const service = makeService()
        const page = await open({ rooms: [room('Kitchen', { services: [service] })] })

        void page.editRoom(0)
        await settle()
        modal.lastOpened()!.ref.close({ name: 'Kitchenette', isDefault: false })
        await settle()

        expect(accessories.rooms()[0]).toMatchObject({ name: 'Kitchenette', services: [service] })
        expect(accessories.saveLayout).toHaveBeenCalled()
      })

      it('moves the default over when a room is made the default', async () => {
        const page = await open({ rooms: [room('Kitchen', { isDefault: true }), room('Hall')] })

        void page.editRoom(1)
        await settle()
        modal.lastOpened()!.ref.close({ name: 'Hall', isDefault: true })
        await settle()

        expect(accessories.rooms().map((r: any) => r.isDefault)).toEqual([false, true])
      })

      it('does nothing for a room index that is not there', async () => {
        const page = await open({ rooms: [room('Kitchen')] })

        await page.editRoom(5)

        expect(modal.opened).toEqual([])
      })

      it('leaves the room alone when the modal is dismissed', async () => {
        const page = await open({ rooms: [room('Kitchen')] })

        void page.editRoom(0)
        await settle()
        modal.lastOpened()!.ref.dismiss()
        await settle()

        expect(accessories.rooms()[0].name).toBe('Kitchen')
        expect(accessories.saveLayout).not.toHaveBeenCalled()
      })

      it('ignores a blank name', async () => {
        const page = await open({ rooms: [room('Kitchen')] })

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
          rooms: [room('Kitchen', { isDefault: true }), room('Spare', { services: [service] })],
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
          rooms: [room('Kitchen', { isDefault: true, services: [service] }), room('Hall')],
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
          rooms: [room('Kitchen', { isDefault: true }), room('Hall')],
        })

        void page.editRoom(0)
        await settle()
        modal.lastOpened()!.ref.close({ delete: true })
        await settle()

        expect(accessories.rooms()[0]).toMatchObject({ name: 'Hall', isDefault: true })
      })

      it('leaves the default where it is when deleting another room', async () => {
        const page = await open({
          rooms: [room('Kitchen', { isDefault: true }), room('Spare')],
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
          rooms: [room('Kitchen'), room('Spare', { services: [service] })],
        })

        void page.editRoom(1)
        await settle()
        modal.lastOpened()!.ref.close({ delete: true })
        await settle()

        expect(accessories.rooms()[0].services).toEqual([service])
      })

      it('saves the layout afterwards', async () => {
        const page = await open({ rooms: [room('Kitchen', { isDefault: true }), room('Spare')] })

        void page.editRoom(1)
        await settle()
        modal.lastOpened()!.ref.close({ delete: true })
        await settle()

        expect(accessories.saveLayout).toHaveBeenCalled()
      })

      it('does not rename anything on the way out', async () => {
        const page = await open({ rooms: [room('Kitchen', { isDefault: true }), room('Spare')] })

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
    const service = (username: string, name: string) => makeService({ instance: { username, name } })
    const room = (services: any[]) => ({ name: 'Kitchen', isDefault: true, services })

    /** Recompute the list from the current rooms. */
    function recompute(page: any) {
      page.updateAvailableBridges()
    }

    it('lists the bridge each accessory belongs to', async () => {
      const page = await open({
        rooms: [room([service('0E:11:11:11:11:11', 'Homebridge'), service('0E:22:22:22:22:22', 'Kitchen Bridge')])],
      })

      recompute(page)

      expect(accessories.availableBridges()).toEqual(['Homebridge', 'Kitchen Bridge'])
    })

    it('puts homebridge itself first, then the rest by name', async () => {
      // It is the one everybody has, and the list reads better with it at the top
      const page = await open({
        rooms: [room([
          service('0E:33:33:33:33:33', 'Zebra Bridge'),
          service('0E:11:11:11:11:11', 'Homebridge'),
          service('0E:22:22:22:22:22', 'Apple Bridge'),
        ])],
      })

      recompute(page)

      expect(accessories.availableBridges()).toEqual(['Homebridge', 'Apple Bridge', 'Zebra Bridge'])
    })

    it('prefers the name the user gave a bridge in the config', async () => {
      const page = await open({
        rooms: [room([service('0E:22:22:22:22:22', 'homebridge-example')])],
        bridgeNames: new Map([['0E:22:22:22:22:22', 'My Own Name']]),
      })

      recompute(page)

      expect(accessories.availableBridges()).toEqual(['My Own Name'])
    })

    it('lists a bridge once however many accessories it has', async () => {
      const page = await open({
        rooms: [room([service('0E:11:11:11:11:11', 'Homebridge'), service('0E:11:11:11:11:11', 'Homebridge')])],
      })

      recompute(page)

      expect(accessories.availableBridges()).toEqual(['Homebridge'])
    })

    it('ignores an accessory with no bridge attached', async () => {
      const page = await open({ rooms: [room([makeService({ instance: undefined })])] })

      recompute(page)

      expect(accessories.availableBridges()).toEqual([])
    })

    it('selects every bridge the first time the list is built', async () => {
      // The filter starts as "show everything"
      const page = await open({
        rooms: [room([service('0E:11:11:11:11:11', 'Homebridge')])],
        selectedBridges: null,
      })

      recompute(page)

      expect(accessories.selectedBridges()).toEqual(['Homebridge'])
    })

    it('keeps showing everything when a new bridge appears', async () => {
      const page = await open({
        rooms: [room([service('0E:11:11:11:11:11', 'Homebridge')])],
        availableBridges: ['Homebridge'],
        selectedBridges: ['Homebridge'],
      })
      accessories.rooms.set([room([service('0E:11:11:11:11:11', 'Homebridge'), service('0E:22:22:22:22:22', 'New Bridge')])])

      recompute(page)

      expect(accessories.selectedBridges()).toEqual(['Homebridge', 'New Bridge'])
    })

    it('leaves a narrowed filter narrowed when a new bridge appears', async () => {
      // The user deliberately hid a bridge; a new one must not undo that
      const page = await open({
        rooms: [room([service('0E:11:11:11:11:11', 'Homebridge'), service('0E:22:22:22:22:22', 'Kitchen Bridge')])],
        availableBridges: ['Homebridge', 'Kitchen Bridge'],
        selectedBridges: ['Homebridge'],
      })
      accessories.rooms.set([room([
        service('0E:11:11:11:11:11', 'Homebridge'),
        service('0E:22:22:22:22:22', 'Kitchen Bridge'),
        service('0E:33:33:33:33:33', 'New Bridge'),
      ])])

      recompute(page)

      expect(accessories.selectedBridges()).toEqual(['Homebridge'])
    })

    it('drops a selected bridge that has gone away', async () => {
      // ⚠️ Only when the new list is not *shorter* than the old one — a shorter list
      // is treated as the names not having arrived yet (see the case below), so a
      // bridge that really has gone is dropped when another appears in its place
      const page = await open({
        rooms: [room([service('0E:11:11:11:11:11', 'Apple Bridge'), service('0E:33:33:33:33:33', 'New Bridge')])],
        availableBridges: ['Apple Bridge', 'Gone Bridge'],
        selectedBridges: ['Gone Bridge'],
      })

      recompute(page)

      expect(accessories.availableBridges()).toEqual(['Apple Bridge', 'New Bridge'])
      expect(accessories.selectedBridges()).not.toContain('Gone Bridge')
    })

    it('keeps a bridge in the list when the new pass is shorter', async () => {
      // The other half of the same rule: nothing is removed on a shrinking pass,
      // because the names may simply not have arrived yet
      const page = await open({
        rooms: [room([service('0E:11:11:11:11:11', 'Apple Bridge')])],
        availableBridges: ['Apple Bridge', 'Kitchen Bridge'],
        selectedBridges: ['Kitchen Bridge'],
      })

      recompute(page)

      expect(accessories.selectedBridges()).toEqual(['Kitchen Bridge'])
    })

    it('ignores a pass that sees fewer bridges than the last one', async () => {
      // ⚠️ The race: the names arrive on their own socket, so an early pass can see
      // fewer bridges. Shrinking here would deselect bridges the user is filtering
      // by and hide their accessories
      const page = await open({
        rooms: [room([service('0E:11:11:11:11:11', 'Homebridge')])],
        availableBridges: ['Homebridge', 'Kitchen Bridge'],
        selectedBridges: ['Homebridge', 'Kitchen Bridge'],
      })

      recompute(page)

      expect(accessories.availableBridges()).toEqual(['Homebridge', 'Kitchen Bridge'])
    })

    it('changes nothing when the list is the same as before', async () => {
      const page = await open({
        rooms: [room([service('0E:11:11:11:11:11', 'Homebridge')])],
        availableBridges: ['Homebridge'],
        selectedBridges: ['Homebridge'],
      })

      recompute(page)

      expect(accessories.selectedBridges()).toEqual(['Homebridge'])
    })
  })
})

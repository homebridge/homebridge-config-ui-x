import type { FakeApi, FakeSettings } from '@/testing'

import { TestBed } from '@angular/core/testing'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { AccessoryOverviewCacheService } from '@/app/core/caching/accessory-overview-cache.service'
import { ACCESSORY_CONTROL_LISTS_MODAL_DATA, NETWORK_INTERFACES_MODAL_DATA } from '@/app/core/modal-data-tokens'
import { AccessoryControlListsComponent } from '@/app/modules/settings/accessory-control-lists/accessory-control-lists.component'
import { PortOverviewModalComponent } from '@/app/modules/settings/port-overview-modal/port-overview-modal.component'
import { SelectNetworkInterfacesComponent } from '@/app/modules/settings/select-network-interfaces/select-network-interfaces.component'
import { WallpaperComponent } from '@/app/modules/settings/wallpaper/wallpaper.component'
import { activeModalStub, fakeApi, makeSettings, toastrStub } from '@/testing'
import { provideFakes, provideTestTranslate } from '@/testing/providers'

/**
 * The four smaller modals reached from the settings page.
 *
 * They have little in common beyond living on that page, but each one has a
 * rule that is easy to get subtly wrong: a list whose ticked state is the
 * inverse of what it stores, a table whose row order is hand-written rather
 * than sorted, a "changed?" check spread over two arrays, and an upload that
 * validates a file size before spending memory encoding it.
 */
describe('settings modals', () => {
  let api: FakeApi
  let settings: FakeSettings
  let toastr: ReturnType<typeof toastrStub>
  let activeModal: ReturnType<typeof activeModalStub>

  /**
   * Build a modal and let its initial read settle.
   * @param type - the modal component
   */
  async function open<T>(type: new (...args: any[]) => T): Promise<T> {
    const fixture = TestBed.createComponent(type as any)
    fixture.detectChanges()
    await fixture.whenStable()
    return fixture.componentInstance as T
  }

  /**
   * Let a promise chain that is not awaited anywhere finish.
   *
   * `whenStable` returns once the component is rendered, which is earlier than
   * the end of a rejected `ngOnInit` chain - the catch block has not run yet.
   */
  function flush(): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, 0))
  }

  /**
   * A file of an arbitrary claimed size.
   *
   * `size` is a getter on Blob.prototype, so an own property shadows it - this
   * avoids allocating 25MB to test the 25MB limit.
   * @param name - the file name
   * @param size - the size to report in bytes
   */
  function makeFile(name: string, size: number): File {
    const file = new File(['x'], name)
    Object.defineProperty(file, 'size', { value: size })
    return file
  }

  /**
   * A change event carrying files, as a file input would raise.
   * @param files - the selected files, if any
   */
  function fileEvent(files: File[]): Event {
    return { target: { files, value: 'C:\\fakepath\\chosen' } } as unknown as Event
  }

  describe('accessory control lists', () => {
    const pairings = [
      { _id: 'main', _username: '0E:AA:AA:AA:AA:AA', _main: true, name: 'Homebridge' },
      { _id: 'ring', _username: '0E:CC:CC:CC:CC:CC', name: 'Ring' },
      { _id: 'hue', _username: '0E:BB:BB:BB:BB:BB', name: 'Hue' },
    ]

    function configure(existingBlacklist: string[] = []) {
      TestBed.resetTestingModule()
      api = fakeApi()
      settings = makeSettings({ env: { featureFlags: { matterSupport: true } } })
      toastr = toastrStub()
      activeModal = activeModalStub()

      TestBed.configureTestingModule({
        providers: [
          provideTestTranslate(),
          provideFakes({ api, settings, toastr, activeModal }),
          {
            provide: AccessoryOverviewCacheService,
            useValue: { get: vi.fn(async () => ({ pairings })), invalidate: vi.fn() },
          },
          { provide: ACCESSORY_CONTROL_LISTS_MODAL_DATA, useValue: { existingBlacklist } },
        ],
      })
    }

    beforeEach(() => configure())

    it('splits the main bridge out from the rest', async () => {
      const modal = await open(AccessoryControlListsComponent)

      // The main bridge gets its own row above the list, so it must not also
      // appear among the child bridges
      expect(modal.mainPairing()?.name).toBe('Homebridge')
      expect(modal.pairings().map(p => p.name)).toEqual(['Hue', 'Ring'])
    })

    it('tidies up the stored list before comparing it', async () => {
      configure(['  0e:bb:bb:bb:bb:bb  ', '0E:CC:CC:CC:CC:CC'])
      const modal = await open(AccessoryControlListsComponent)

      // The list arrives from the config file, so it may be lower case, padded
      // or in any order. If normalising happened after the snapshot instead of
      // before, the modal would open already claiming unsaved changes
      expect(modal.blacklistHasUpdated).toBe(false)
      expect(modal.isInList('0E:BB:BB:BB:BB:BB')).toBe(true)
    })

    it('adds and removes a bridge from the list', async () => {
      const modal = await open(AccessoryControlListsComponent)

      modal.toggleList('0E:BB:BB:BB:BB:BB')
      expect(modal.isInList('0E:BB:BB:BB:BB:BB')).toBe(true)
      expect(modal.blacklistHasUpdated).toBe(true)

      modal.toggleList('0E:BB:BB:BB:BB:BB')
      expect(modal.isInList('0E:BB:BB:BB:BB:BB')).toBe(false)
      expect(modal.blacklistHasUpdated).toBe(false)
    })

    it('ignores the order the user ticked things in', async () => {
      configure(['0E:BB:BB:BB:BB:BB', '0E:CC:CC:CC:CC:CC'])
      const modal = await open(AccessoryControlListsComponent)

      modal.toggleList('0E:BB:BB:BB:BB:BB')
      modal.toggleList('0E:BB:BB:BB:BB:BB')

      // Both arrays are sorted before being joined, so ticking a box off and
      // back on again is not an unsaved change
      expect(modal.blacklistHasUpdated).toBe(false)
    })

    it('saves the list and remembers it locally', async () => {
      const modal = await open(AccessoryControlListsComponent)
      modal.toggleList('0E:BB:BB:BB:BB:BB')

      await modal.updateBlacklist()

      // The nesting looks like a mistake but is not: the controller signature
      // is `setAccessoryControlInstanceBlacklist(@Body() { body })`, so the
      // array has to arrive wrapped in a `body` key
      expect(api.lastCall('put', '/config-editor/ui/accessory-control/instance-blacklist')?.body).toEqual({
        body: ['0E:BB:BB:BB:BB:BB'],
      })
      expect(settings.env.accessoryControl?.instanceBlacklist).toEqual(['0E:BB:BB:BB:BB:BB'])
      expect(activeModal.close).toHaveBeenCalled()
    })

    it('lets the user try again when saving fails', async () => {
      api.fail('put', '/config-editor/ui/accessory-control/instance-blacklist', new Error('offline'))
      const modal = await open(AccessoryControlListsComponent)

      await modal.updateBlacklist()

      expect(modal.clicked()).toBe(false)
      expect(activeModal.close).not.toHaveBeenCalled()
      expect(toastr.at('error')).toHaveLength(1)
    })

    it('closes itself when the bridge list cannot be read', async () => {
      TestBed.resetTestingModule()
      api = fakeApi()
      toastr = toastrStub()
      activeModal = activeModalStub()

      TestBed.configureTestingModule({
        providers: [
          provideTestTranslate(),
          provideFakes({ api, settings: makeSettings(), toastr, activeModal }),
          {
            provide: AccessoryOverviewCacheService,
            useValue: { get: vi.fn(async () => Promise.reject(new Error('offline'))), invalidate: vi.fn() },
          },
          { provide: ACCESSORY_CONTROL_LISTS_MODAL_DATA, useValue: { existingBlacklist: [] } },
        ],
      })

      await open(AccessoryControlListsComponent)
      await flush()

      // There is nothing to choose from, so staying open would only offer the
      // user a save button that wipes their list
      expect(activeModal.close).toHaveBeenCalled()
    })
  })

  describe('network interface selection', () => {
    const available = [
      { iface: 'eth0', ip4: '192.168.1.10', selected: false },
      { iface: 'wlan0', ip4: '192.168.1.11', selected: false },
      { iface: 'lo', ip4: '127.0.0.1', selected: false },
    ]

    function configure(selectedIfaces: string[]) {
      TestBed.resetTestingModule()
      activeModal = activeModalStub()

      TestBed.configureTestingModule({
        providers: [
          provideTestTranslate(),
          provideFakes({ activeModal }),
          {
            provide: NETWORK_INTERFACES_MODAL_DATA,
            useValue: {
              // Cloned so one test's ticking does not leak into the next
              adaptersAvailable: available.map(a => ({ ...a })),
              adaptersSelected: selectedIfaces.map(iface => ({ iface })),
            },
          },
        ],
      })
    }

    it('ticks the adapters that are already in use', async () => {
      configure(['eth0'])
      const modal = await open(SelectNetworkInterfacesComponent)

      expect(modal.adaptersAvailable.map(a => a.selected)).toEqual([true, false, false])
      expect(modal.isUnchanged()).toBe(true)
    })

    it('notices an adapter being added', async () => {
      configure(['eth0'])
      const modal = await open(SelectNetworkInterfacesComponent)

      modal.adaptersAvailable[1].selected = true
      modal.onAdapterSelectionChange()

      expect(modal.isUnchanged()).toBe(false)
    })

    it('notices a swap that keeps the count the same', async () => {
      configure(['eth0'])
      const modal = await open(SelectNetworkInterfacesComponent)

      modal.adaptersAvailable[0].selected = false
      modal.adaptersAvailable[1].selected = true
      modal.onAdapterSelectionChange()

      // A length check alone would call this unchanged, which would grey out
      // the save button on a real change
      expect(modal.isUnchanged()).toBe(false)
    })

    it('returns to unchanged when the original set is restored', async () => {
      configure(['eth0'])
      const modal = await open(SelectNetworkInterfacesComponent)

      modal.adaptersAvailable[1].selected = true
      modal.onAdapterSelectionChange()
      modal.adaptersAvailable[1].selected = false
      modal.onAdapterSelectionChange()

      expect(modal.isUnchanged()).toBe(true)
    })

    it('closes with just the interface names', async () => {
      configure(['eth0'])
      const modal = await open(SelectNetworkInterfacesComponent)
      modal.adaptersAvailable[1].selected = true

      modal.submit()

      // The caller writes this straight into the config, so it must be names
      // and not the objects the modal displays
      expect(activeModal.close).toHaveBeenCalledWith(['eth0', 'wlan0'])
    })

    it('closes with an empty list when nothing is ticked', async () => {
      configure(['eth0'])
      const modal = await open(SelectNetworkInterfacesComponent)
      modal.adaptersAvailable[0].selected = false

      modal.submit()

      expect(activeModal.close).toHaveBeenCalledWith([])
    })

    it('puts the ticks back when cancelled', async () => {
      configure(['eth0'])
      const modal = await open(SelectNetworkInterfacesComponent)
      modal.adaptersAvailable[1].selected = true

      modal.closeAndReset()

      // The adapter objects come from the parent by reference, so a cancel
      // that did not undo the ticks would leave them changed on the page
      expect(modal.adaptersAvailable.map(a => a.selected)).toEqual([true, false, false])
      expect(activeModal.dismiss).toHaveBeenCalled()
    })
  })

  describe('port overview', () => {
    function configure() {
      TestBed.resetTestingModule()
      api = fakeApi()
      // The modal fetches this on open whatever the test is about, and an
      // unmatched route resolves `undefined`, so destructuring `entries` off it
      // throws and is logged. Routes match last-registered-first, so a test that
      // cares about the payload still overrides this.
      api.respond('get', '/server/network/overview', { entries: [], conflicts: [] })
      toastr = toastrStub()
      activeModal = activeModalStub()

      TestBed.configureTestingModule({
        providers: [
          provideTestTranslate(),
          provideFakes({ api, settings: makeSettings(), toastr, activeModal }),
        ],
      })
    }

    beforeEach(() => configure())

    it('lists homebridge first, then the ui, then bridges by name', async () => {
      api.respond('get', '/server/network/overview', {
        entries: [
          { service: 'Child Bridge', port: 52001, protocol: 'hap', bridge: 'Ring', status: 'ok' },
          { service: 'Config UI', port: 8581, protocol: 'http', bridge: 'Homebridge UI', status: 'ok' },
          { service: 'Child Bridge', port: 52000, protocol: 'hap', bridge: 'Hue', status: 'ok' },
          { service: 'Homebridge', port: 51826, protocol: 'hap', bridge: 'Homebridge', status: 'ok' },
        ],
        conflicts: [],
      })

      const modal = await open(PortOverviewModalComponent)

      expect(modal.entries().map(e => e.bridge)).toEqual(['Homebridge', 'Homebridge UI', 'Hue', 'Ring'])
      expect(modal.loading()).toBe(false)
    })

    it('reports the ui under its product name', async () => {
      const modal = await open(PortOverviewModalComponent)

      // The server calls it 'Config UI'; nothing else in the app does
      expect(modal.displayName({ service: 'Config UI', bridge: 'anything' } as any)).toBe('Homebridge UI')
      expect(modal.displayName({ service: 'Child Bridge', bridge: 'Hue' } as any)).toBe('Hue')
    })

    it('passes the conflicting ports through untouched', async () => {
      api.respond('get', '/server/network/overview', { entries: [], conflicts: ['51826', '8581'] })

      const modal = await open(PortOverviewModalComponent)

      expect(modal.conflicts()).toEqual(['51826', '8581'])
    })

    it('stops loading even when the read fails', async () => {
      api.fail('get', '/server/network/overview', new Error('offline'))

      const modal = await open(PortOverviewModalComponent)

      // Without the finally block the modal would sit on a spinner forever
      expect(modal.loading()).toBe(false)
      expect(toastr.at('error')).toHaveLength(1)
    })
  })

  describe('wallpaper', () => {
    function configure(customWallpaperHash = '') {
      TestBed.resetTestingModule()
      api = fakeApi()
      settings = makeSettings({ env: { customWallpaperHash } })
      toastr = toastrStub()
      activeModal = activeModalStub()

      TestBed.configureTestingModule({
        providers: [
          provideTestTranslate(),
          provideFakes({ api, settings, toastr, activeModal }),
        ],
      })
    }

    beforeEach(() => configure())

    it('shows the wallpaper already saved on the server', async () => {
      configure('abc123')
      const modal = await open(WallpaperComponent)

      expect(modal.wallpaperUrl()).toContain('/auth/wallpaper/abc123')
      expect(modal.originalWallpaperUrl()).toBe(modal.wallpaperUrl())
    })

    it('starts with nothing when no wallpaper is set', async () => {
      const modal = await open(WallpaperComponent)

      expect(modal.wallpaperUrl()).toBeNull()
    })

    it('refuses a file bigger than the upload limit', async () => {
      configure('abc123')
      const modal = await open(WallpaperComponent)
      const before = modal.wallpaperUrl()

      modal.onFileChange(fileEvent([makeFile('huge.png', globalThis.backup.maxBackupSize + 1)]))

      // Checked before the bytes are base64-encoded for the preview: a 40MB
      // image would otherwise lock the tab up and then be rejected anyway
      expect(modal.selectedFile()).toBeNull()
      expect(modal.wallpaperUrl()).toBe(before)
      expect(toastr.at('error')).toHaveLength(1)
    })

    it('accepts a file within the limit', async () => {
      const modal = await open(WallpaperComponent)

      modal.onFileChange(fileEvent([makeFile('nice.png', 1024)]))

      expect(modal.selectedFile()?.name).toBe('nice.png')
      expect(toastr.at('error')).toHaveLength(0)
    })

    it('goes back to the saved wallpaper when the picker is cleared', async () => {
      configure('abc123')
      const modal = await open(WallpaperComponent)
      modal.onFileChange(fileEvent([makeFile('nice.png', 1024)]))

      modal.onFileChange(fileEvent([]))

      expect(modal.selectedFile()).toBeNull()
      expect(modal.wallpaperUrl()).toBe(modal.originalWallpaperUrl())
    })

    it('uploads the chosen file as form data', async () => {
      const modal = await open(WallpaperComponent)
      modal.onFileChange(fileEvent([makeFile('nice.png', 1024)]))

      await modal.saveWallpaper()

      const call = api.lastCall('post', '/server/wallpaper')
      expect(call?.body).toBeInstanceOf(FormData)
      expect((call?.body as FormData).get('wallpaper')).toBeInstanceOf(File)
      expect(activeModal.close).toHaveBeenCalled()
    })

    it('records the saved wallpaper under its own extension', async () => {
      const modal = await open(WallpaperComponent)
      modal.onFileChange(fileEvent([makeFile('holiday.photo.jpeg', 1024)]))

      await modal.saveWallpaper()

      // Only the last dotted part is the extension, which a naive split would
      // get wrong on a name like this one
      expect(settings.setItem).toHaveBeenCalledWith('wallpaper', 'ui-wallpaper.jpeg')
    })

    it('deletes the wallpaper when saving with nothing chosen', async () => {
      configure('abc123')
      const modal = await open(WallpaperComponent)

      await modal.saveWallpaper()

      expect(api.callsTo('delete', '/server/wallpaper')).toHaveLength(1)
      expect(api.callsTo('post', '/server/wallpaper')).toHaveLength(0)
      expect(activeModal.close).toHaveBeenCalled()
    })

    it('lets the user try again when the upload fails', async () => {
      api.fail('post', '/server/wallpaper', new Error('too big'))
      const modal = await open(WallpaperComponent)
      modal.onFileChange(fileEvent([makeFile('nice.png', 1024)]))

      await modal.saveWallpaper()

      expect(modal.clicked()).toBe(false)
      expect(activeModal.close).not.toHaveBeenCalled()
    })

    it('drops a newly chosen file back to the saved one', async () => {
      configure('abc123')
      const modal = await open(WallpaperComponent)
      const saved = modal.originalWallpaperUrl()
      modal.wallpaperUrl.set('data:image/png;base64,preview')

      modal.clearWallpaper()

      expect(modal.selectedFile()).toBeNull()
      expect(modal.wallpaperUrl()).toBe(saved)
    })

    it('clears the saved wallpaper on a second press', async () => {
      configure('abc123')
      const modal = await open(WallpaperComponent)

      modal.clearWallpaper()

      // Pressing clear while the saved wallpaper is showing is how the user
      // asks for it to be removed, which is what makes save send a DELETE
      expect(modal.wallpaperUrl()).toBeNull()
    })
  })
})

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
    return {
      target: { files, value: 'C:\\fakepath\\chosen' },
    } as unknown as Event
  }

  describe('accessory control lists', () => {
    const pairings = [
      {
        _id: 'main',
        _username: '0E:AA:AA:AA:AA:AA',
        _main: true,
        name: 'Homebridge',
      },
      { _id: 'ring', _username: '0E:CC:CC:CC:CC:CC', name: 'Ring' },
      { _id: 'hue', _username: '0E:BB:BB:BB:BB:BB', name: 'Hue' },
    ]

    function configure(existingBlacklist: string[] = []) {
      TestBed.resetTestingModule()
      api = fakeApi()
      settings = makeSettings({
        env: {
          featureFlags: { matterSupport: true },
        },
      })
      toastr = toastrStub()
      activeModal = activeModalStub()

      TestBed.configureTestingModule({
        providers: [
          provideTestTranslate(),
          provideFakes({ api, settings, toastr, activeModal }),
          {
            provide: AccessoryOverviewCacheService,
            useValue: {
              get: vi.fn(async () => ({ pairings })),
              invalidate: vi.fn(),
            },
          },
          {
            provide: ACCESSORY_CONTROL_LISTS_MODAL_DATA,
            useValue: { existingBlacklist },
          },
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

    it('leaves out matter storage that nothing uses, as no accessory runs from it', async () => {
      const leftOver = {
        _id: 'old',
        _username: '0E:DD:DD:DD:DD:DD',
        name: 'Old Vacuum',
        _matterOnly: true,
        _couldBeStale: true,
      }
      const inUse = {
        _id: 'vac',
        _username: '0E:EE:EE:EE:EE:EE',
        name: 'Vacuum',
        _matterOnly: true,
        _couldBeStale: false,
      }
      pairings.push(leftOver, inUse)
      try {
        const modal = await open(AccessoryControlListsComponent)

        expect(modal.pairings().map(p => p.name)).toEqual(['Hue', 'Ring', 'Vacuum'])
      } finally {
        pairings.splice(pairings.indexOf(leftOver), 2)
      }
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
          provideFakes({
            api,
            settings: makeSettings(),
            toastr,
            activeModal,
          }),
          {
            provide: AccessoryOverviewCacheService,
            useValue: {
              get: vi.fn(async () => Promise.reject(new Error('offline'))),
              invalidate: vi.fn(),
            },
          },
          {
            provide: ACCESSORY_CONTROL_LISTS_MODAL_DATA,
            useValue: { existingBlacklist: [] },
          },
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
      {
        iface: 'eth0',
        ip4: '192.168.1.10',
        ip6: 'fd00::10',
        selected: false,
      },
      {
        iface: 'wlan0',
        ip4: '192.168.1.11',
        ip6: '',
        selected: false,
      },
      { iface: 'lo', ip4: '127.0.0.1', selected: false },
    ]

    /**
     * @param selected - what bridge.bind holds: an adapter name, or `{ entry, iface }`
     * for an ip address (`entry`) and the adapter that has it (`iface`)
     * @param canBindByAddress - whether Homebridge is new enough to take an address
     */
    function configure(selected: Array<string | { entry: string, iface: string }>, canBindByAddress = true) {
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
              adaptersSelected: selected.map(x => typeof x === 'string'
                ? { entry: x, iface: x, byAddress: false }
                : { ...x, byAddress: true }),
              canBindByAddress,
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

    /**
     * An adapter can be bound by one of its ip addresses instead of its name.
     *
     * ⚠️ This is what keeps a bridge on one network when the adapter names move:
     * in a Docker container on two networks, which of eth0/eth1 sits on which
     * network changes from one start to the next, but the address on each does not.
     */
    describe('binding an adapter by ip address', () => {
      it('offers an adapter\'s name and each address it has', async () => {
        configure([])
        const modal = await open(SelectNetworkInterfacesComponent)

        expect(modal.bindOptions(modal.adaptersAvailable[0])).toEqual(['eth0', '192.168.1.10', 'fd00::10'])
        // An adapter with no IPv6 address reports an empty string for it
        expect(modal.bindOptions(modal.adaptersAvailable[1])).toEqual(['wlan0', '192.168.1.11'])
      })

      it('binds by name unless told otherwise', async () => {
        configure(['eth0'])
        const modal = await open(SelectNetworkInterfacesComponent)

        expect(modal.adaptersAvailable.map(a => a.bindBy)).toEqual(['eth0', 'wlan0', 'lo'])
      })

      it('ticks the adapter that has an address already in use, and shows the address as chosen', async () => {
        configure([
          { entry: '192.168.1.11', iface: 'wlan0' },
        ])
        const modal = await open(SelectNetworkInterfacesComponent)

        expect(modal.adaptersAvailable.map(a => a.selected)).toEqual([false, true, false])
        expect(modal.adaptersAvailable[1].bindBy).toBe('192.168.1.11')
        expect(modal.isUnchanged()).toBe(true)
      })

      it('offers an address in use that is not one of the two the adapter is listed with', async () => {
        // An adapter can have more addresses than the one IPv4 and one IPv6 shown
        configure([
          { entry: '192.168.1.99', iface: 'eth0' },
        ])
        const modal = await open(SelectNetworkInterfacesComponent)

        expect(modal.adaptersAvailable[0].bindBy).toBe('192.168.1.99')
        expect(modal.bindOptions(modal.adaptersAvailable[0])).toContain('192.168.1.99')
      })

      it('notices a switch from name to address on a ticked adapter', async () => {
        configure(['eth0'])
        const modal = await open(SelectNetworkInterfacesComponent)

        modal.adaptersAvailable[0].bindBy = '192.168.1.10'
        modal.onAdapterSelectionChange()

        // The same adapters are ticked, so comparing ticks alone would grey out save
        expect(modal.isUnchanged()).toBe(false)
      })

      it('returns to unchanged when switched back to the name', async () => {
        configure(['eth0'])
        const modal = await open(SelectNetworkInterfacesComponent)

        modal.adaptersAvailable[0].bindBy = '192.168.1.10'
        modal.onAdapterSelectionChange()
        modal.adaptersAvailable[0].bindBy = 'eth0'
        modal.onAdapterSelectionChange()

        expect(modal.isUnchanged()).toBe(true)
      })

      it('closes with the address in place of the name', async () => {
        configure(['eth0'])
        const modal = await open(SelectNetworkInterfacesComponent)
        modal.adaptersAvailable[0].bindBy = '192.168.1.10'
        modal.adaptersAvailable[1].selected = true

        modal.submit()

        expect(activeModal.close).toHaveBeenCalledWith(['192.168.1.10', 'wlan0'])
      })

      it('keeps an address already in use when another adapter is added', async () => {
        // Saving names only would quietly turn the address back into a name
        configure([
          { entry: '192.168.1.11', iface: 'wlan0' },
        ])
        const modal = await open(SelectNetworkInterfacesComponent)
        modal.adaptersAvailable[0].selected = true

        modal.submit()

        expect(activeModal.close).toHaveBeenCalledWith(['eth0', '192.168.1.11'])
      })

      it('puts the name-or-address choice back when cancelled', async () => {
        configure([
          { entry: '192.168.1.11', iface: 'wlan0' },
        ])
        const modal = await open(SelectNetworkInterfacesComponent)
        modal.adaptersAvailable[0].selected = true
        modal.adaptersAvailable[0].bindBy = '192.168.1.10'
        modal.adaptersAvailable[1].bindBy = 'wlan0'

        modal.closeAndReset()

        expect(modal.adaptersAvailable.map(a => a.selected)).toEqual([false, true, false])
        expect(modal.adaptersAvailable.map(a => a.bindBy)).toEqual(['eth0', '192.168.1.11', 'lo'])
      })

      it('shows the name-or-address choice only for a ticked adapter', async () => {
        configure(['eth0'])
        const fixture = TestBed.createComponent(SelectNetworkInterfacesComponent)
        fixture.detectChanges()
        await fixture.whenStable()

        const selects = fixture.nativeElement.querySelectorAll('select')
        expect(selects).toHaveLength(1)
        expect(selects[0].id).toBe('bindByeth0')
        expect(selects[0].querySelectorAll('option')).toHaveLength(3)
      })

      /**
       * ⚠️ An adapter makes up its own link-local address (fe80::), often from
       * its MAC address, so in Docker it can change when the container
       * restarts. Offered here, it would be an address that stops matching
       * after the next restart, which is the very thing an address is chosen
       * to avoid. `ip6` is the link-local address when the adapter has no other.
       */
      describe('an IPv6 link-local address', () => {
        function adapter(modal: SelectNetworkInterfacesComponent, values: Record<string, any>) {
          return Object.assign(modal.adaptersAvailable[0], values)
        }

        it('is not offered', async () => {
          configure([])
          const modal = await open(SelectNetworkInterfacesComponent)

          expect(modal.bindOptions(adapter(modal, { ip6: 'fe80::42:acff:fe12:5' }))).toEqual(['eth0', '192.168.1.10'])
        })

        it('is not offered anywhere in fe80::/10, however it is written', async () => {
          configure([])
          const modal = await open(SelectNetworkInterfacesComponent)

          for (const ip6 of [
            'fe80::1',
            'FE80::1',
            'fe9a::1',
            'feab::1',
            'febf::1',
          ]) {
            expect(modal.bindOptions(adapter(modal, { ip6 }))).toEqual(['eth0', '192.168.1.10'])
          }
        })

        it('does not take a nearby address for link-local', async () => {
          // A unique local address (fd00::/8) is what an IPv6 Docker network
          // hands out, and it stays put. fec0:: and fe7f:: lie just outside fe80::/10
          configure([])
          const modal = await open(SelectNetworkInterfacesComponent)

          for (const ip6 of [
            'fd00::10',
            '2001:db8::10',
            'fec0::1',
            'fe7f::1',
          ]) {
            expect(modal.bindOptions(adapter(modal, { ip6 }))).toEqual(['eth0', '192.168.1.10', ip6])
          }
        })

        it('leaves an adapter that has nothing else with its name only, and no choice to show', async () => {
          // A tunnel or peer-to-peer adapter (utun0, awdl0) has only a link-local address
          configure(['eth0'])
          const fixture = TestBed.createComponent(SelectNetworkInterfacesComponent)
          adapter(fixture.componentInstance, { ip4: '', ip6: 'fe80::1' })
          fixture.detectChanges()
          await fixture.whenStable()

          expect(fixture.componentInstance.bindOptions(fixture.componentInstance.adaptersAvailable[0])).toEqual(['eth0'])
          expect(fixture.nativeElement.querySelectorAll('select')).toHaveLength(0)
        })

        it('stays a choice when config.json already holds it', async () => {
          // Written by hand: it is not ours to remove, and saving another
          // change must not turn it into a name
          configure([
            { entry: 'fe80::42:acff:fe12:5', iface: 'eth0' },
          ])
          const modal = await open(SelectNetworkInterfacesComponent)
          adapter(modal, { ip6: 'fe80::42:acff:fe12:5' })
          modal.adaptersAvailable[1].selected = true

          expect(modal.bindOptions(modal.adaptersAvailable[0])).toEqual(['eth0', '192.168.1.10', 'fe80::42:acff:fe12:5'])

          modal.submit()

          expect(activeModal.close).toHaveBeenCalledWith(['fe80::42:acff:fe12:5', 'wlan0'])
        })
      })

      it('still offers the address the modal opened with after a switch to the name', async () => {
        // Without it, a switch away from an address that is not one of the two
        // listed could only be undone by cancelling
        configure([
          { entry: '192.168.1.99', iface: 'eth0' },
        ])
        const modal = await open(SelectNetworkInterfacesComponent)

        modal.adaptersAvailable[0].bindBy = 'eth0'

        expect(modal.bindOptions(modal.adaptersAvailable[0])).toContain('192.168.1.99')
      })

      /**
       * ⚠️ Before v2.5.1, Homebridge hands an address in bridge.bind to Matter
       * as an adapter name, and Matter then fails to start. On such a version
       * the modal must not offer what would break the bridge.
       */
      describe('on a Homebridge that cannot take an address', () => {
        it('offers only the adapter name', async () => {
          configure(['eth0'], false)
          const modal = await open(SelectNetworkInterfacesComponent)

          expect(modal.bindOptions(modal.adaptersAvailable[0])).toEqual(['eth0'])
        })

        it('shows no name-or-address choice and no advice to pick an address', async () => {
          configure(['eth0'], false)
          const fixture = TestBed.createComponent(SelectNetworkInterfacesComponent)
          fixture.detectChanges()
          await fixture.whenStable()

          expect(fixture.nativeElement.querySelectorAll('select')).toHaveLength(0)
          // Only the standing note about leaving every adapter unticked
          expect(fixture.nativeElement.querySelectorAll('.modal-body ul:not(.list-group) li')).toHaveLength(1)
        })

        it('keeps an address written in config.json by hand, and lets it be swapped for the name', async () => {
          // HAP alone has always taken an address, so one may already be there.
          // It is not ours to remove, and saving another change must not drop it
          configure([
            { entry: '192.168.1.11', iface: 'wlan0' },
          ], false)
          const modal = await open(SelectNetworkInterfacesComponent)
          modal.adaptersAvailable[0].selected = true

          expect(modal.bindOptions(modal.adaptersAvailable[1])).toEqual(['wlan0', '192.168.1.11'])

          modal.submit()

          expect(activeModal.close).toHaveBeenCalledWith(['eth0', '192.168.1.11'])
        })
      })
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
          provideFakes({
            api,
            settings: makeSettings(),
            toastr,
            activeModal,
          }),
        ],
      })
    }

    beforeEach(() => configure())

    it('lists homebridge first, then the ui, then bridges by name', async () => {
      api.respond('get', '/server/network/overview', {
        entries: [
          {
            service: 'Child Bridge',
            port: 52001,
            protocol: 'hap',
            bridge: 'Ring',
            status: 'ok',
          },
          {
            service: 'Config UI',
            port: 8581,
            protocol: 'http',
            bridge: 'Homebridge UI',
            status: 'ok',
          },
          {
            service: 'Child Bridge',
            port: 52000,
            protocol: 'hap',
            bridge: 'Hue',
            status: 'ok',
          },
          {
            service: 'Homebridge',
            port: 51826,
            protocol: 'hap',
            bridge: 'Homebridge',
            status: 'ok',
          },
        ],
        conflicts: [],
      })

      const modal = await open(PortOverviewModalComponent)

      expect(modal.entries().map(e => e.bridge)).toEqual([
        'Homebridge',
        'Homebridge UI',
        'Hue',
        'Ring',
      ])
      expect(modal.loading()).toBe(false)
    })

    it('reports the ui under its product name', async () => {
      const modal = await open(PortOverviewModalComponent)

      // The server calls it 'Config UI'; nothing else in the app does
      expect(modal.displayName({ service: 'Config UI', bridge: 'anything' } as any)).toBe('Homebridge UI')
      expect(modal.displayName({ service: 'Child Bridge', bridge: 'Hue' } as any)).toBe('Hue')
    })

    it('passes the conflicting ports through untouched', async () => {
      api.respond('get', '/server/network/overview', {
        entries: [],
        conflicts: ['51826', '8581'],
      })

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
      settings = makeSettings({
        env: { customWallpaperHash },
      })
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

      modal.onFileChange(fileEvent([
        makeFile('huge.png', globalThis.backup.maxBackupSize + 1),
      ]))

      // Checked before the bytes are base64-encoded for the preview: a 40MB
      // image would otherwise lock the tab up and then be rejected anyway
      expect(modal.selectedFile()).toBeNull()
      expect(modal.wallpaperUrl()).toBe(before)
      expect(toastr.at('error')).toHaveLength(1)
    })

    it('accepts a file within the limit', async () => {
      const modal = await open(WallpaperComponent)

      modal.onFileChange(fileEvent([
        makeFile('nice.png', 1024),
      ]))

      expect(modal.selectedFile()?.name).toBe('nice.png')
      expect(toastr.at('error')).toHaveLength(0)
    })

    it('goes back to the saved wallpaper when the picker is cleared', async () => {
      configure('abc123')
      const modal = await open(WallpaperComponent)
      modal.onFileChange(fileEvent([
        makeFile('nice.png', 1024),
      ]))

      modal.onFileChange(fileEvent([]))

      expect(modal.selectedFile()).toBeNull()
      expect(modal.wallpaperUrl()).toBe(modal.originalWallpaperUrl())
    })

    it('uploads the chosen file as form data', async () => {
      const modal = await open(WallpaperComponent)
      modal.onFileChange(fileEvent([
        makeFile('nice.png', 1024),
      ]))

      await modal.saveWallpaper()

      const call = api.lastCall('post', '/server/wallpaper')
      expect(call?.body).toBeInstanceOf(FormData)
      expect((call?.body as FormData).get('wallpaper')).toBeInstanceOf(File)
      expect(activeModal.close).toHaveBeenCalled()
    })

    it('records the saved wallpaper under its own extension', async () => {
      const modal = await open(WallpaperComponent)
      modal.onFileChange(fileEvent([
        makeFile('holiday.photo.jpeg', 1024),
      ]))

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
      modal.onFileChange(fileEvent([
        makeFile('nice.png', 1024),
      ]))

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

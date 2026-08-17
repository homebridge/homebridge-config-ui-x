import type { FakeApi, FakeCache, FakeSettings, FakeToastr } from '@/testing'

import { NO_ERRORS_SCHEMA } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { provideRouter, Router } from '@angular/router'
import { TranslatePipe } from '@ngx-translate/core'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { AccessoryOverviewCacheService } from '@/app/core/caching/accessory-overview-cache.service'
import { ServerPairingsCacheService } from '@/app/core/caching/server-pairings-cache.service'
import { RestartChildBridgesComponent } from '@/app/core/components/restart-child-bridges/restart-child-bridges.component'
import { CONFIG_RESTORE_MODAL_DATA, PLUGIN_EXTERNALS_MODAL_DATA, RESET_ACCESSORIES_MODAL_DATA, RESTART_CHILD_BRIDGES_MODAL_DATA } from '@/app/core/modal-data-tokens'
import { PluginExternalsComponent } from '@/app/core/plugins/plugin-externals/plugin-externals.component'
import { ResetAccessoriesComponent } from '@/app/core/plugins/reset-accessories/reset-accessories.component'
import { activeModalStub, cacheStub, fakeApi, makePlugin, makeSettings, toastrStub } from '@/testing'
import { provideFakes, provideTestTranslate } from '@/testing/providers'

vi.mock('file-saver', () => ({ saveAs: vi.fn() }))

/**
 * Four modals with nothing else covering them: restarting a plugin's child
 * bridges, resetting individual accessory pairings, listing a plugin's external
 * accessories, and the config backup list.
 *
 * Two of them carry fixes that had no regression test:
 *
 * - **restart child bridges** used to stop at the first bridge that failed,
 *   leaving the rest running the old config;
 * - **reset accessories** used to leave its button disabled for ever when the
 *   reset failed, so the only way to retry was to reopen the modal.
 *
 * ⚠️ `ConfigRestoreComponent` is loaded with `await import()` and imported above
 * as a type only. A top-level value import evaluates it against the real
 * `file-saver` before the mock registry is consulted, and the download assertion
 * then reads zero calls — which looks like the component never saving anything.
 */
describe('the bridge and backup modals', () => {
  let api: FakeApi
  let toastr: FakeToastr
  let settings: FakeSettings
  let activeModal: ReturnType<typeof activeModalStub>
  let navigate: ReturnType<typeof vi.fn>

  /**
   * Build a modal.
   * @param type - the modal component
   * @param token - its modal data token
   * @param data - the modal data
   * @param options - extra providers and settings
   * @param options.featureFlags - the settings feature flags to enable
   * @param options.overview - the accessory overview cache stub
   * @param options.pairings - the server pairings cache stub
   * @param options.arrange - runs on the fresh fakes before the modal is created
   */
  async function open<T>(
    type: new (...args: any[]) => T,
    token: any,
    data: Record<string, any>,
    options: {
      featureFlags?: Record<string, boolean>
      overview?: FakeCache<any>
      pairings?: FakeCache<any>
      arrange?: () => void
    } = {},
  ) {
    TestBed.resetTestingModule()
    api = fakeApi()
    toastr = toastrStub()
    settings = makeSettings({ env: { featureFlags: options.featureFlags ?? {} } })
    activeModal = activeModalStub()

    TestBed.configureTestingModule({
      imports: [type as any],
      providers: [
        provideRouter([]),
        provideTestTranslate(),
        provideFakes({ api, toastr, settings, activeModal }),
        { provide: AccessoryOverviewCacheService, useValue: options.overview ?? cacheStub<any>({ pairings: [] }) },
        { provide: ServerPairingsCacheService, useValue: options.pairings ?? cacheStub<any[]>([]) },
        { provide: token, useValue: data },
      ],
    })

    TestBed.overrideComponent(type as any, {
      set: { imports: [TranslatePipe], schemas: [NO_ERRORS_SCHEMA] },
    })

    options.arrange?.()

    navigate = vi.fn(async () => true)
    vi.spyOn(TestBed.inject(Router), 'navigate').mockImplementation(navigate as any)

    const fixture = TestBed.createComponent(type as any)
    fixture.detectChanges()
    await settle()
    return fixture.componentInstance as T
  }

  async function settle() {
    for (let tick = 0; tick < 12; tick += 1) {
      await Promise.resolve()
    }
  }

  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.mocked(console.error).mockClear()
  })

  describe('restarting the child bridges of a plugin', () => {
    const bridges = [
      { username: '0E:11:11:11:11:11', name: 'Bridge One' },
      { username: '0E:22:22:22:22:22', name: 'Bridge Two' },
      { username: '0E:33:33:33:33:33', name: 'Bridge Three' },
    ] as any[]

    function openModal(arrange?: () => void) {
      return open(RestartChildBridgesComponent, RESTART_CHILD_BRIDGES_MODAL_DATA, { bridges }, { arrange })
    }

    it('restarts every bridge it was given', async () => {
      const modal = await openModal()

      await modal.onRestartChildBridgeClick()

      expect(api.callsTo('put').map(call => call.url)).toEqual([
        '/server/restart/0E:11:11:11:11:11',
        '/server/restart/0E:22:22:22:22:22',
        '/server/restart/0E:33:33:33:33:33',
      ])
      expect(toastr.success).toHaveBeenCalled()
      expect(activeModal.close).toHaveBeenCalled()
    })

    it('keeps going past a bridge that fails to restart', async () => {
      // Stopping at the first failure left the remaining bridges running the
      // old config, with nothing on screen saying so
      const modal = await openModal(() => api.fail('put', '/server/restart/0E:22:22:22:22:22', new Error('not running')))

      await modal.onRestartChildBridgeClick()

      expect(api.callsTo('put')).toHaveLength(3)
      expect(toastr.error).toHaveBeenCalledWith('plugins.manage.child_bridge_restart_failed', 'toast.title_error')
      expect(toastr.success).not.toHaveBeenCalled()
    })

    it('closes even when every restart failed', async () => {
      const modal = await openModal(() => api.fail('put', /^\/server\/restart\//, new Error('not running')))

      await modal.onRestartChildBridgeClick()

      expect(activeModal.close).toHaveBeenCalled()
    })

    it('does nothing when it was opened with no bridges', async () => {
      const modal = await open(RestartChildBridgesComponent, RESTART_CHILD_BRIDGES_MODAL_DATA, { bridges: undefined })

      await modal.onRestartChildBridgeClick()

      expect(api.callsTo('put')).toEqual([])
      expect(activeModal.close).not.toHaveBeenCalled()
    })

    it('dismisses without restarting anything', async () => {
      const modal = await openModal()

      modal.dismissModal()

      expect(api.callsTo('put')).toEqual([])
      expect(activeModal.dismiss).toHaveBeenCalledWith('Dismiss')
    })
  })

  describe('resetting individual accessory pairings', () => {
    const childBridges = [
      { username: '0E:11:11:11:11:11', plugin: 'homebridge-example', name: 'Bridge One' },
      { username: '0E:22:22:22:22:22', plugin: 'homebridge-example', name: 'Bridge Two' },
    ] as any[]

    function bridgePairing(username: string, name: string, extra: Record<string, any> = {}) {
      return { _category: 'bridge', _main: false, _username: username, name, ...extra }
    }

    function openModal(pairings: any[], options: { featureFlags?: Record<string, boolean>, arrange?: () => void } = {}) {
      return open(ResetAccessoriesComponent, RESET_ACCESSORIES_MODAL_DATA, { childBridges }, {
        overview: cacheStub<any>({ pairings }),
        featureFlags: options.featureFlags,
        arrange: options.arrange,
      })
    }

    it('lists only the child bridges belonging to this plugin', async () => {
      const modal = await openModal([
        bridgePairing('0E:11:11:11:11:11', 'Bridge One'),
        bridgePairing('0E:99:99:99:99:99', 'Someone Else'),
      ])

      expect(modal.pairings().map(pairing => pairing.name)).toEqual(['Bridge One'])
    })

    it('leaves the main bridge out of the list', async () => {
      // Resetting the main bridge is a different, far more destructive action
      const modal = await openModal([
        { _category: 'bridge', _main: true, _username: '0E:11:11:11:11:11', name: 'Homebridge' },
        bridgePairing('0E:22:22:22:22:22', 'Bridge Two'),
      ])

      expect(modal.pairings().map(pairing => pairing.name)).toEqual(['Bridge Two'])
    })

    it('sorts the list by name', async () => {
      const modal = await openModal([
        bridgePairing('0E:22:22:22:22:22', 'Zebra'),
        bridgePairing('0E:11:11:11:11:11', 'Apple'),
      ])

      expect(modal.pairings().map(pairing => pairing.name)).toEqual(['Apple', 'Zebra'])
    })

    it('lists a bridge once per protocol when it has both', async () => {
      // HAP and Matter are reset separately, so each needs its own row
      const modal = await openModal(
        [bridgePairing('0E:11:11:11:11:11', 'Bridge One', { _matter: true })],
        { featureFlags: { matterSupport: true } },
      )

      expect(modal.pairings().map(pairing => pairing._protocol)).toEqual(['hap', 'matter'])
    })

    it('lists only the hap row when matter is not supported', async () => {
      const modal = await openModal([bridgePairing('0E:11:11:11:11:11', 'Bridge One', { _matter: true })])

      expect(modal.pairings().map(pairing => pairing._protocol)).toEqual(['hap'])
    })

    it('includes a matter-only external accessory of this plugin', async () => {
      const modal = await openModal(
        [{ _matterOnly: true, _plugin: 'homebridge-example', name: 'External Light' }],
        { featureFlags: { matterSupport: true } },
      )

      expect(modal.pairings().map(pairing => pairing.name)).toEqual(['External Light'])
      expect(modal.pairings()[0]._protocol).toBe('matter')
    })

    it('leaves the matter-only accessory of another plugin alone', async () => {
      const modal = await openModal(
        [{ _matterOnly: true, _plugin: 'homebridge-other', name: 'Not Mine' }],
        { featureFlags: { matterSupport: true } },
      )

      expect(modal.pairings()).toEqual([])
    })

    it('closes and complains when the pairings cannot be read', async () => {
      const failing = cacheStub<any>()
      failing.get = vi.fn(async () => {
        throw new Error('server unavailable')
      })
      const modal = await open(ResetAccessoriesComponent, RESET_ACCESSORIES_MODAL_DATA, { childBridges }, { overview: failing })

      expect(modal.pairings()).toEqual([])
      expect(toastr.error).toHaveBeenCalledWith('server unavailable', 'toast.title_error')
      expect(activeModal.close).toHaveBeenCalled()
    })

    describe('choosing what to reset', () => {
      it('keeps the two protocols of one bridge separate', async () => {
        // Selecting Matter must not also select HAP on the same bridge
        const modal = await openModal([], { featureFlags: { matterSupport: true } })

        modal.toggleList('0E:11:11:11:11:11', 'matter')

        expect(modal.isInList('0E:11:11:11:11:11', 'matter')).toBe(true)
        expect(modal.isInList('0E:11:11:11:11:11', 'hap')).toBe(false)
      })

      it('takes an entry back out when it is chosen again', async () => {
        const modal = await openModal([])

        modal.toggleList('0E:11:11:11:11:11', 'hap')
        modal.toggleList('0E:11:11:11:11:11', 'hap')

        expect(modal.toDelete()).toEqual([])
      })

      it('keeps several bridges at once', async () => {
        const modal = await openModal([])

        modal.toggleList('0E:11:11:11:11:11', 'hap')
        modal.toggleList('0E:22:22:22:22:22', 'hap')

        expect(modal.toDelete()).toEqual([
          { id: '0E:11:11:11:11:11', protocol: 'hap' },
          { id: '0E:22:22:22:22:22', protocol: 'hap' },
        ])
      })
    })

    describe('carrying out the reset', () => {
      it('sends the chosen entries as the request body', async () => {
        // ⚠️ The controller reads them from a body on a DELETE, which is easy to
        // lose in a refactor
        const modal = await openModal([])
        modal.toggleList('0E:11:11:11:11:11', 'hap')

        await modal.cleanBridges()

        const call = api.lastCall('delete')
        expect(call?.url).toBe('/server/pairings/accessories')
        expect(call?.options?.body).toEqual([{ id: '0E:11:11:11:11:11', protocol: 'hap' }])
      })

      it('sends the user to the restart page afterwards', async () => {
        const modal = await openModal([])

        await modal.cleanBridges()

        expect(toastr.success).toHaveBeenCalled()
        expect(activeModal.close).toHaveBeenCalled()
        expect(navigate).toHaveBeenCalledWith(['/restart'], { queryParams: { restarting: true } })
      })

      it('re-enables the button when the reset fails', async () => {
        // It used to stay disabled, so the only way to retry was to close the
        // modal and open it again
        const modal = await openModal([], { arrange: () => api.fail('delete', '/server/pairings/accessories', new Error('permission denied')) })

        await modal.cleanBridges()

        expect(modal.clicked()).toBe(false)
        expect(toastr.error).toHaveBeenCalledWith('permission denied', 'toast.title_error')
        expect(activeModal.close).not.toHaveBeenCalled()
        expect(navigate).not.toHaveBeenCalled()
      })

      it('disables the button while the reset is running', async () => {
        const modal = await openModal([])

        const running = modal.cleanBridges()
        expect(modal.clicked()).toBe(true)

        await running
      })
    })
  })

  describe('the external accessories of a plugin', () => {
    function openModal(pairings: any[], failing = false) {
      const cache = cacheStub<any[]>(pairings)
      if (failing) {
        cache.get = vi.fn(async () => {
          throw new Error('server unavailable')
        })
      }
      return open(
        PluginExternalsComponent,
        PLUGIN_EXTERNALS_MODAL_DATA,
        { plugin: makePlugin({ name: 'homebridge-example' }) },
        { pairings: cache },
      )
    }

    it('lists the external accessories of this plugin', async () => {
      const modal = await openModal([
        { _plugin: 'homebridge-example', _isExternal: true, name: 'Camera' },
        { _plugin: 'homebridge-other', _isExternal: true, name: 'Not Mine' },
      ])

      expect(modal.accessories().map(accessory => accessory.name)).toEqual(['Camera'])
    })

    it('lists a matter-only accessory as external too', async () => {
      const modal = await openModal([{ _plugin: 'homebridge-example', _matterOnly: true, name: 'Matter Light' }])

      expect(modal.accessories().map(accessory => accessory.name)).toEqual(['Matter Light'])
    })

    it('leaves a bridged accessory out', async () => {
      // Only externals need their own pairing code
      const modal = await openModal([{ _plugin: 'homebridge-example', name: 'Bridged Switch' }])

      expect(modal.accessories()).toEqual([])
    })

    it('sorts them by name', async () => {
      const modal = await openModal([
        { _plugin: 'homebridge-example', _isExternal: true, name: 'Zebra' },
        { _plugin: 'homebridge-example', _isExternal: true, name: 'Apple' },
      ])

      expect(modal.accessories().map(accessory => accessory.name)).toEqual(['Apple', 'Zebra'])
    })

    it('stops loading even when the pairings cannot be read', async () => {
      // Otherwise the modal spins for ever with no explanation
      const modal = await openModal([], true)

      expect(modal.loading()).toBe(false)
      expect(modal.accessories()).toEqual([])
      expect(toastr.error).toHaveBeenCalledWith('external_accessories.toast_failed_to_load', 'toast.title_error')
    })

    it('falls back to the homebridge icon when a plugin icon will not load', async () => {
      const modal = await openModal([])
      const image = document.createElement('img')
      image.src = 'https://example.com/missing.png'

      modal.handleIconError({ target: image } as unknown as Event)

      expect(image.src).toContain('assets/hb-icon.png')
    })
  })

  describe('the config backup list', () => {
    const backups = [
      { id: '1700000000000', timestamp: '2026-08-01T10:00:00.000Z', file: 'config.json.1700000000000' },
      { id: '1700000001000', timestamp: '2026-08-02T10:00:00.000Z', file: 'config.json.1700000001000' },
    ]

    async function openModal(options: { fromSettings?: boolean, arrange?: () => void } = {}) {
      const { ConfigRestoreComponent } = await import('@/app/modules/config-editor/config-restore/config-restore.component')
      return open(
        ConfigRestoreComponent,
        CONFIG_RESTORE_MODAL_DATA,
        { currentConfig: '{"bridge":{}}', fromSettings: options.fromSettings },
        {
          arrange: () => {
            api.respond('get', '/config-editor/backups', backups)
            options.arrange?.()
          },
        },
      )
    }

    it('lists the backups the server has', async () => {
      const modal = await openModal()

      expect(modal.backupList()).toEqual(backups)
      expect(modal.loading()).toBe(false)
    })

    it('closes itself when the list cannot be read', async () => {
      const modal = await openModal({ arrange: () => api.fail('get', '/config-editor/backups', new Error('no backups directory')) })

      expect(modal.loading()).toBe(false)
      expect(toastr.error).toHaveBeenCalled()
      expect(activeModal.dismiss).toHaveBeenCalledWith('Dismiss')
    })

    it('hands the chosen backup id back to the caller', async () => {
      // The config editor is what actually applies it
      const modal = await openModal()

      modal.restore('1700000000000')

      expect(activeModal.close).toHaveBeenCalledWith('1700000000000')
    })

    it('downloads one backup as formatted json', async () => {
      const modal = await openModal({ arrange: () => api.respond('get', '/config-editor/backups/1700000000000', { bridge: { name: 'Homebridge' } }) })

      await modal.download('1700000000000')

      const { saveAs } = await import('file-saver')
      expect(saveAs).toHaveBeenCalledWith(expect.any(Blob), 'config-backup-1700000000000.json')
      expect(modal.clicked()).toBe(false)
    })

    it('re-enables the download button when the backup cannot be fetched', async () => {
      const modal = await openModal({ arrange: () => api.fail('get', /\/config-editor\/backups\/\d+/, new Error('gone')) })

      await modal.download('1700000000000')

      expect(modal.clicked()).toBe(false)
      expect(toastr.error).toHaveBeenCalled()
    })

    it('reloads the list after deleting one backup', async () => {
      // So the deleted row disappears without reopening the modal
      const modal = await openModal({ arrange: () => api.respond('delete', '/config-editor/backups/1700000000000', {}) })
      api.clearCalls()

      await modal.delete('1700000000000')

      expect(api.callsTo('delete').map(call => call.url)).toEqual(['/config-editor/backups/1700000000000'])
      expect(api.callsTo('get', '/config-editor/backups')).toHaveLength(1)
      expect(modal.deleting()).toBeNull()
    })

    it('stops showing a row as deleting when the delete fails', async () => {
      const modal = await openModal({ arrange: () => api.fail('delete', /\/config-editor\/backups\/\d+/, new Error('permission denied')) })

      await modal.delete('1700000000000')

      expect(modal.deleting()).toBeNull()
      expect(toastr.error).toHaveBeenCalled()
    })

    it('empties the list when all the backups are deleted', async () => {
      const modal = await openModal({ arrange: () => api.respond('delete', '/config-editor/backups', {}) })

      await modal.deleteAllBackups()

      expect(modal.backupList()).toEqual([])
      expect(toastr.success).toHaveBeenCalledWith('config.restore.toast_backups_deleted', 'toast.title_success')
      expect(modal.deleting()).toBeNull()
    })

    it('keeps the list when deleting them all fails', async () => {
      const modal = await openModal({ arrange: () => api.fail('delete', '/config-editor/backups', new Error('permission denied')) })

      await modal.deleteAllBackups()

      expect(modal.backupList()).toEqual(backups)
      expect(modal.deleting()).toBeNull()
      expect(toastr.error).toHaveBeenCalled()
    })

    it('offers the config as it stands now, without asking the server', async () => {
      const modal = await openModal()
      api.clearCalls()

      modal.downloadCurrentConfig()

      expect(api.callsTo('get')).toEqual([])
    })

    it('goes back to the settings page when it was opened from there', async () => {
      // Otherwise dismissing leaves the user on a page they did not choose
      const modal = await openModal({ fromSettings: true })

      modal.dismissModal()

      expect(navigate).toHaveBeenCalledWith(['/settings'])
      expect(activeModal.dismiss).toHaveBeenCalledWith('Dismiss')
    })

    it('stays where it is when it was opened from the config editor', async () => {
      const modal = await openModal({ fromSettings: false })

      modal.dismissModal()

      expect(navigate).not.toHaveBeenCalled()
      expect(activeModal.dismiss).toHaveBeenCalledWith('Dismiss')
    })
  })
})

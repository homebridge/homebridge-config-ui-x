import type { FakeCache, FakeIoNamespace, FakeSettings, FakeToastr, FakeWs } from '@/testing'

import { NO_ERRORS_SCHEMA } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { TranslatePipe } from '@ngx-translate/core'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { PluginsCacheService } from '@/app/core/caching/plugins-cache.service'
import { HB_V2_MODAL_DATA } from '@/app/core/modal-data-tokens'
import { HbV2ModalComponent } from '@/app/modules/status/widgets/update-info-widget/hb-v2-modal/hb-v2-modal.component'
import { cacheStub, fakeWs, makeSettings, toastrStub } from '@/testing'
import { provideFakes, provideTestTranslate } from '@/testing/providers'

/**
 * The "ready for Homebridge v2?" modal: it lists every installed plugin and says
 * whether that plugin has declared it works with v2.
 *
 * ⚠️ **Whether a plugin supports v2 is a semver question, not a string one.** A
 * plugin declares `engines.homebridge` as a range, and the ranges that cover v2
 * look nothing alike — `^2.0.0`, `2.x`, `>=2.0.0`, `^1.8.0 || ^2.0.0`. This used
 * to be a prefix match, which called most of them unsupported and told users their
 * plugins were not ready when they were.
 *
 * ⚠️ **The verdict decides whether the update goes ahead unattended.** With
 * `skipIfCompatible` the modal closes itself and lets the update run when every
 * plugin is ready, so a wrong "supported" here means updating into a broken setup.
 */
describe('hbV2ModalComponent', () => {
  let settings: FakeSettings
  let toastr: FakeToastr
  let ws: FakeWs
  let io: FakeIoNamespace
  let pluginsCache: FakeCache<any[]>
  let activeModal: { close: ReturnType<typeof vi.fn>, dismiss: ReturnType<typeof vi.fn> }

  /**
   * A plugin as the installed-plugins cache holds it.
   * @param name - the plugin name
   * @param engines - what it declares in `engines.homebridge`
   */
  function installed(name: string, engines?: string) {
    return { name, displayName: name, engines: engines === undefined ? undefined : { homebridge: engines } }
  }

  /**
   * Open the modal.
   * @param options - how to set it up
   * @param options.plugins - what the plugins cache holds
   * @param options.homebridgeVersion - the version running now
   * @param options.nodeVersion - the node version the server reports
   * @param options.skipIfCompatible - close by itself when everything is ready
   * @param options.connected - whether the status socket is connected
   */
  function open(options: {
    plugins?: any[]
    homebridgeVersion?: string
    nodeVersion?: string
    skipIfCompatible?: boolean
    connected?: boolean
  } = {}) {
    TestBed.resetTestingModule()
    toastr = toastrStub()
    ws = fakeWs()
    pluginsCache = cacheStub<any[]>(options.plugins ?? [])
    activeModal = { close: vi.fn(), dismiss: vi.fn() }
    settings = makeSettings({ env: { homebridgeVersion: options.homebridgeVersion ?? '1.8.0' } })

    io = ws.namespace('status', { connected: options.connected ?? true })
    io.socket.respondTo('get-homebridge-server-info', { nodeVersion: options.nodeVersion ?? '22.0.0' })

    TestBed.configureTestingModule({
      imports: [HbV2ModalComponent],
      providers: [
        provideTestTranslate(),
        provideFakes({ settings, toastr, ws, activeModal }),
        { provide: PluginsCacheService, useValue: pluginsCache },
        {
          provide: HB_V2_MODAL_DATA,
          useValue: { isUpdating: false, skipIfCompatible: options.skipIfCompatible ?? false },
        },
      ],
    })

    TestBed.overrideComponent(HbV2ModalComponent, {
      set: { imports: [TranslatePipe], schemas: [NO_ERRORS_SCHEMA] },
    })

    const fixture = TestBed.createComponent(HbV2ModalComponent)
    fixture.detectChanges()
    return fixture.componentInstance
  }

  async function settle() {
    for (let tick = 0; tick < 15; tick += 1) {
      await Promise.resolve()
    }
  }

  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.mocked(console.error).mockClear()
  })

  describe('reading each plugin declared support', () => {
    /**
     * The verdict on one plugin.
     * @param engines - its `engines.homebridge` range
     * @param homebridgeVersion - the version running now
     */
    async function verdictFor(engines?: string, homebridgeVersion = '1.8.0') {
      const modal = open({ plugins: [installed('homebridge-example', engines)], homebridgeVersion })
      await settle()
      return modal.installedPlugins()[0].hb2Ready
    }

    it.each([
      ['a caret range on v2', '^2.0.0'],
      ['an x range', '2.x'],
      ['a bare major', '2'],
      ['a minimum version', '>=2.0.0'],
      ['a range spanning both majors', '^1.8.0 || ^2.0.0'],
      ['a range starting mid-v1', '>=1.6.0'],
      ['anything at all', '*'],
    ])('counts %s as supported', async (_label, engines) => {
      expect(await verdictFor(engines)).toBe('supported')
    })

    it.each([
      ['a v1-only caret range', '^1.8.0'],
      ['a v1 x range', '1.x'],
      ['an upper bound below v2', '<2.0.0'],
    ])('cannot vouch for %s', async (_label, engines) => {
      expect(await verdictFor(engines)).toBe('unknown')
    })

    it('cannot vouch for a plugin that declares nothing', async () => {
      expect(await verdictFor(undefined)).toBe('unknown')
    })

    it('cannot vouch for a plugin whose range makes no sense', async () => {
      // A plugin can publish anything; semver throws on this and the answer has
      // to be "unknown", not a crash that leaves the list empty
      expect(await verdictFor('not-a-range')).toBe('unknown')
    })

    it('says nothing either way once v2 is already running', async () => {
      // The question has been answered by then
      expect(await verdictFor('^1.8.0', '2.0.0')).toBe('hide')
    })

    it('never asks about the ui itself', async () => {
      const modal = open({ plugins: [installed('homebridge-config-ui-x', '^1.8.0'), installed('homebridge-example', '^2.0.0')] })
      await settle()

      expect(modal.installedPlugins().map(p => p.name)).toEqual(['homebridge-example'])
    })

    it('lists the plugins in name order', async () => {
      const modal = open({
        plugins: [installed('homebridge-zebra', '^2.0.0'), installed('homebridge-apple', '^2.0.0')],
      })
      await settle()

      expect(modal.installedPlugins().map(p => p.name)).toEqual(['homebridge-apple', 'homebridge-zebra'])
    })
  })

  describe('the overall verdict', () => {
    it('says everything is ready when every plugin declares v2', async () => {
      const modal = open({ plugins: [installed('homebridge-a', '^2.0.0'), installed('homebridge-b', '2.x')] })
      await settle()

      expect(modal.allPluginsSupported()).toBe(true)
    })

    it('says it is not ready when one plugin does not', async () => {
      const modal = open({ plugins: [installed('homebridge-a', '^2.0.0'), installed('homebridge-b', '^1.8.0')] })
      await settle()

      expect(modal.allPluginsSupported()).toBe(false)
    })

    it('says a box with no plugins is ready', async () => {
      const modal = open({ plugins: [] })
      await settle()

      expect(modal.allPluginsSupported()).toBe(true)
    })

    it('starts from ready again when the list is reloaded', async () => {
      // ⚠️ The flag is a running total over the list. Without resetting it, a
      // reload after the user updated the offending plugin still reported the old
      // verdict, and the readiness button stayed switched off
      const modal = open({ plugins: [installed('homebridge-a', '^1.8.0')] })
      await settle()
      expect(modal.allPluginsSupported()).toBe(false)

      pluginsCache.setValue([installed('homebridge-a', '^2.0.0')])
      await (modal as any).loadInstalledPlugins()

      expect(modal.allPluginsSupported()).toBe(true)
    })

    it('empties the list before reloading it, rather than doubling it up', async () => {
      const modal = open({ plugins: [installed('homebridge-a', '^2.0.0')] })
      await settle()

      await (modal as any).loadInstalledPlugins()

      expect(modal.installedPlugins()).toHaveLength(1)
    })
  })

  describe('getting on with the update by itself', () => {
    it('closes and asks for the update when everything is ready', async () => {
      // This is the "do not stop to ask" path from the readiness button
      open({ plugins: [installed('homebridge-a', '^2.0.0')], skipIfCompatible: true })
      await settle()

      expect(activeModal.close).toHaveBeenCalledWith('update')
    })

    it('closes on a box with no plugins at all', async () => {
      open({ plugins: [], skipIfCompatible: true })
      await settle()

      expect(activeModal.close).toHaveBeenCalledWith('update')
    })

    it('stays open when a plugin cannot be vouched for', async () => {
      open({ plugins: [installed('homebridge-a', '^1.8.0')], skipIfCompatible: true })
      await settle()

      expect(activeModal.close).not.toHaveBeenCalled()
    })

    it('stays open when it was not asked to skip', async () => {
      open({ plugins: [installed('homebridge-a', '^2.0.0')], skipIfCompatible: false })
      await settle()

      expect(activeModal.close).not.toHaveBeenCalled()
    })
  })

  describe('whether node is ready too', () => {
    it('is ready on node 22', async () => {
      const modal = open({ nodeVersion: '22.14.0' })
      await settle()

      expect(modal.nodeReady()).toBe(true)
    })

    it('is ready on anything newer', async () => {
      const modal = open({ nodeVersion: '24.0.0' })
      await settle()

      expect(modal.nodeReady()).toBe(true)
    })

    it('is not ready on node 20', async () => {
      const modal = open({ nodeVersion: '20.11.0' })
      await settle()

      expect(modal.nodeReady()).toBe(false)
    })

    it('says nothing while the socket is down', async () => {
      // Asking would hang; the plugin list still loads from the cache
      const modal = open({ connected: false, plugins: [installed('homebridge-a', '^2.0.0')] })
      await settle()

      expect(modal.nodeReady()).toBe(false)
      expect(modal.installedPlugins()).toHaveLength(1)
    })

    it('says so when the server cannot be asked', async () => {
      const modal = open({ plugins: [] })
      io.socket.respondTo('get-homebridge-server-info', () => {
        throw new Error('socket error')
      })
      await (modal as any).checkHomebridgeUiVersion()

      expect(toastr.error).toHaveBeenCalled()
      expect(console.error).toHaveBeenCalled()
    })
  })

  describe('while it is loading', () => {
    it('starts out loading', () => {
      const modal = open()

      expect(modal.loading()).toBe(true)
    })

    it('stops once the list is in', async () => {
      const modal = open({ plugins: [installed('homebridge-a', '^2.0.0')] })
      await settle()

      expect(modal.loading()).toBe(false)
    })

    it('stops even when the list could not be read', async () => {
      // Otherwise the modal spins for ever with no way to know why
      const modal = open()
      pluginsCache.get.mockRejectedValue(new Error('server unavailable'))
      await (modal as any).loadInstalledPlugins()

      expect(toastr.error).toHaveBeenCalledWith('plugins.toast_failed_to_load_plugins', 'toast.title_error')
      expect(modal.installedPlugins()).toEqual([])
    })
  })

  describe('the rest of the modal', () => {
    it('falls back to the homebridge icon for a plugin with none', async () => {
      const modal = open({ plugins: [installed('homebridge-a', '^2.0.0')] })
      await settle()
      const plugin = modal.installedPlugins()[0]

      modal.handleIconError(plugin)

      expect(plugin.icon).toBe('assets/hb-icon.png')
    })

    it('passes on the reason it was closed with', () => {
      // The caller acts on 'update' and ignores anything else
      const modal = open()

      modal.closeModal('update')

      expect(activeModal.close).toHaveBeenCalledWith('update')
    })
  })
})

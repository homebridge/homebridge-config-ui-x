import type { ChildBridge, Plugin } from '@/app/core/plugins/manage-plugins.interfaces'
import type { FakeApi, FakeAuth, FakeModalService, FakeSettings, FakeToastr, FakeWs } from '@/testing'
import type { ComponentFixture } from '@angular/core/testing'

import { TestBed } from '@angular/core/testing'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { PluginsCacheService } from '@/app/core/caching/plugins-cache.service'
import { ConfirmComponent } from '@/app/core/components/confirm/confirm.component'
import { RestartHomebridgeComponent } from '@/app/core/components/restart-homebridge/restart-homebridge.component'
import { CONFIRM_MODAL_DATA, DISABLE_PLUGIN_MODAL_DATA, PLUGIN_LOGS_MODAL_DATA, PLUGIN_MODAL_DATA } from '@/app/core/modal-data-tokens'
import { DisablePluginComponent } from '@/app/core/plugins/disable-plugin/disable-plugin.component'
import { DonateComponent } from '@/app/core/plugins/donate/donate.component'
import { ManagePluginsService } from '@/app/core/plugins/manage-plugins.service'
import { PluginInfoComponent } from '@/app/core/plugins/plugin-info/plugin-info.component'
import { PluginLogsComponent } from '@/app/core/plugins/plugin-logs/plugin-logs.component'
import { MobileDetectService } from '@/app/core/utilities/mobile-detect.service'
import { PluginCardComponent } from '@/app/modules/plugins/plugin-card/plugin-card.component'
import { fakeApi, fakeWs, makeAuth, makeChildBridge, makePlugin, makeSettings, modalServiceSpy, toastrStub } from '@/testing'
import { provideFakes, provideTestTranslate } from '@/testing/providers'

/**
 * One plugin card can be in a lot of states at once, and the single "call to
 * action" icon it shows is chosen by a stack of conditions in the template.
 * Showing the wrong one sends the user to the wrong place - offering a set-up
 * prompt for a plugin that is already configured, or hiding an available
 * update behind a bridge warning.
 */
describe('PluginCardComponent', () => {
  let auth: FakeAuth
  let settings: FakeSettings
  let api: FakeApi
  let modal: FakeModalService
  let toastr: FakeToastr
  let ws: FakeWs
  let pluginsCache: { get: ReturnType<typeof vi.fn>, invalidate: ReturnType<typeof vi.fn> }
  let managePlugins: Record<string, ReturnType<typeof vi.fn>>
  let fixture: ComponentFixture<PluginCardComponent>

  beforeEach(() => {
    auth = makeAuth({ user: { admin: true } })
    settings = makeSettings()
    api = fakeApi()
    modal = modalServiceSpy()
    toastr = toastrStub()
    ws = fakeWs()
    ws.namespace('child-bridges')
    pluginsCache = { get: vi.fn(async () => []), invalidate: vi.fn() }
    managePlugins = {
      settings: vi.fn(),
      bridgeSettings: vi.fn(),
      checkAndUpdatePlugin: vi.fn(),
      installPlugin: vi.fn(),
      uninstallPlugin: vi.fn(),
      switchToScoped: vi.fn(),
      installAlternateVersion: vi.fn(),
      jsonEditor: vi.fn(),
      externalAccessories: vi.fn(),
      resetChildBridges: vi.fn(),
    }

    TestBed.configureTestingModule({
      imports: [PluginCardComponent],
      providers: [
        provideTestTranslate(),
        provideFakes({ api, auth, settings, ws, toastr, modal }),
        { provide: PluginsCacheService, useValue: pluginsCache },
        { provide: MobileDetectService, useValue: { detect: { mobile: () => null } } },
        { provide: ManagePluginsService, useValue: managePlugins },
      ],
    })
  })

  function render(plugin: Partial<Plugin> = {}, childBridges: ChildBridge[] = [], isSearchResult = false): HTMLElement {
    fixture = TestBed.createComponent(PluginCardComponent)
    // A fresh plugin object per render: ngOnInit rewrites displayName and icon
    // on the input, so a shared fixture would leak between cases
    fixture.componentRef.setInput('plugin', makePlugin(plugin))
    fixture.componentRef.setInput('childBridges', childBridges)
    fixture.componentRef.setInput('isSearchResult', isSearchResult)
    fixture.detectChanges()
    return fixture.nativeElement as HTMLElement
  }

  /**
   * Which call-to-action icon the card is showing, if any.
   *
   * Scoped to the row beside the plugin name: the same icon names appear
   * again inside the actions menu, where they mean something different.
   */
  function actionIcon(element: HTMLElement): string | undefined {
    const header = element.querySelector('.card-title')!.parentElement!
    const icons = [
      'fa-arrow-alt-circle-up',
      'fa-arrow-right-arrow-left',
      'fa-sliders',
      'fa-bridge',
      'fa-qrcode',
      'fa-bridge-circle-exclamation',
      'fa-bridge-circle-xmark',
    ]
    return icons.find(icon => header.querySelector(`.${icon}:not([hidden])`))
  }

  describe('the call to action icon', () => {
    it('offers the update when one is available', () => {
      expect(actionIcon(render({ updateAvailable: true }))).toBe('fa-arrow-alt-circle-up')
    })

    it('offers the move to the homebridge scope', () => {
      const element = render({
        installedVersion: '1.0.0',
        newHbScope: { from: 'homebridge-test', to: '@homebridge-plugins/homebridge-test', switch: '1.0.0' },
      } as Partial<Plugin>)

      expect(actionIcon(element)).toBe('fa-arrow-right-arrow-left')
    })

    it('offers to set up a plugin that has no config yet', () => {
      expect(actionIcon(render({ isConfigured: false }))).toBe('fa-sliders')
    })

    it('suggests a child bridge when one is recommended', () => {
      const element = render({ isConfigured: true, hasChildBridges: false, recommendChildBridge: true })

      expect(actionIcon(element)).toBe('fa-bridge')
    })

    it('offers the pairing code for a bridge that is not paired yet', () => {
      const element = render(
        { isConfigured: true, hasChildBridges: true, hasChildBridgesUnpaired: true },
        [makeChildBridge({ status: 'ok' })],
      )

      expect(actionIcon(element)).toBe('fa-qrcode')
    })

    it('warns while a child bridge is still starting', () => {
      const element = render(
        { isConfigured: true, hasChildBridges: true, hasChildBridgesUnpaired: false },
        [makeChildBridge({ status: 'pending' })],
      )

      expect(actionIcon(element)).toBe('fa-bridge-circle-exclamation')
    })

    it('warns when a child bridge is down', () => {
      const element = render(
        { isConfigured: true, hasChildBridges: true, hasChildBridgesUnpaired: false },
        [makeChildBridge({ status: 'down' })],
      )

      expect(actionIcon(element)).toBe('fa-bridge-circle-xmark')
    })

    it('shows nothing when everything is healthy', () => {
      const element = render(
        { isConfigured: true, hasChildBridges: true, hasChildBridgesUnpaired: false },
        [makeChildBridge({ status: 'ok' })],
      )

      expect(actionIcon(element)).toBeUndefined()
    })

    it('says nothing to a non-admin', () => {
      auth.user.admin = false

      // A non-admin cannot act on any of it, so the prompts are pointless
      expect(actionIcon(render({ updateAvailable: true }))).toBeUndefined()
    })

    it('leaves a disabled plugin alone', () => {
      const element = render({ disabled: true, isConfigured: false })

      expect(actionIcon(element)).toBeUndefined()
    })
  })

  describe('the verification shield', () => {
    it.each([
      ['a homebridge scoped plugin', { isHbScoped: true, verifiedPlugin: false }, 'purple-text'],
      ['a verified plugin', { isHbScoped: false, verifiedPlugin: true }, 'green-text'],
      ['a verified plus plugin', { isHbScoped: false, verifiedPlugin: false, verifiedPlusPlugin: true }, 'green-text'],
      ['an unverified plugin', { isHbScoped: false, verifiedPlugin: false, verifiedPlusPlugin: false }, 'orange-text'],
    ])('is %s coloured %s', (_case, plugin, expected) => {
      const shield = render(plugin).querySelector('.fa-shield-alt')!

      expect(shield.classList.contains(expected)).toBe(true)
    })

    it('shows the scoped colour even for a verified plugin', () => {
      // Being in the homebridge scope is the stronger statement of the two
      const shield = render({ isHbScoped: true, verifiedPlusPlugin: true }).querySelector('.fa-shield-alt')!

      expect(shield.classList.contains('purple-text')).toBe(true)
      expect(shield.classList.contains('green-text')).toBe(false)
    })
  })

  describe('the child bridge status', () => {
    it.each([
      ['all running', ['ok', 'ok'], 'ok'],
      ['one still starting', ['ok', 'pending'], 'pending'],
      ['one down', ['ok', 'down'], 'down'],
      ['one down and one starting', ['pending', 'down'], 'down'],
    ])('reports %s as %s', (_case, statuses, expected) => {
      // Worst first: a single failed bridge has to surface even when its
      // siblings are fine
      render({ hasChildBridges: true }, statuses.map(status => makeChildBridge({ status: status as any })))

      expect(fixture.componentInstance.childBridgeStatus()).toBe(expected)
    })
  })

  describe('the transport icons', () => {
    /** [hap enabled, matter enabled] as the card is showing them. */
    function transports(element: HTMLElement): boolean[] {
      return [...element.querySelectorAll('.transport-icon')].map(icon => icon.classList.contains('enabled'))
    }

    it('are only shown on a search result', () => {
      // An installed plugin already sits under whichever bridge it uses, so
      // the protocol badges only mean something while browsing
      expect(render({}, [], false).querySelector('.transport-icons')).toBeNull()
      expect(render({}, [], true).querySelector('.transport-icons')).not.toBeNull()
    })

    it.each([
      ['both protocols', { supportsHap: true, supportsMatter: true }, [true, true]],
      ['hap only', { supportsHap: true, supportsMatter: false }, [true, false]],
      ['matter only', { supportsHap: false, supportsMatter: true }, [false, true]],
      ['neither declared', {}, [true, false]],
    ])('shows %s', (_case, plugin, expected) => {
      // A plugin that declares nothing predates the keywords, and everything
      // from that era is hap
      expect(transports(render(plugin as Partial<Plugin>, [], true))).toEqual(expected)
    })
  })

  describe('the actions menu', () => {
    function menuItems(element: HTMLElement): string[] {
      return [...element.querySelectorAll('[ngbdropdownitem], .dropdown-item')]
        .map(node => node.textContent!.trim())
        .filter(Boolean)
    }

    it('offers the usual actions for an installed plugin', () => {
      const items = menuItems(render({ isConfigured: true })).join(' ')

      expect(items).toContain('plugins.button_settings')
      expect(items).toContain('plugins.manage.json_config')
      expect(items).toContain('plugins.button_uninstall')
    })

    it('keeps the ui plugin out of the uninstall and disable options', () => {
      // Uninstalling or disabling the ui from inside the ui would lock the
      // user out of the only place they could undo it
      const items = menuItems(render({ name: 'homebridge-config-ui-x' })).join(' ')

      expect(items).not.toContain('plugins.button_uninstall')
      expect(items).not.toContain('plugins.manage.disable')
    })
  })

  /**
   * Switching a plugin off and on again.
   *
   * ⚠️ **Disabling has to stop the plugin's child bridges too.** A disabled plugin
   * whose bridge is still running leaves its accessories in the Home app,
   * responding to nothing — which looks like broken hardware rather than a plugin
   * the user switched off.
   */
  describe('disabling and enabling a plugin', () => {
    /** The component behind the rendered card. */
    function card() {
      return fixture.componentInstance
    }

    async function settle() {
      for (let tick = 0; tick < 12; tick += 1) {
        await Promise.resolve()
      }
    }

    it('asks first, telling the modal what it will affect', async () => {
      render({ name: 'homebridge-example', displayName: 'Example', isConfigured: true, isConfiguredDynamicPlatform: true })
      settings.keepOrphans = true

      void card().disablePlugin(card().plugin())
      await settle()

      expect(modal.lastOpened()!.content).toBe(DisablePluginComponent)
      expect(modal.dataFor(DISABLE_PLUGIN_MODAL_DATA)).toMatchObject({
        pluginName: 'Example',
        isConfigured: true,
        isConfiguredDynamicPlatform: true,
        keepOrphans: true,
      })
    })

    it('falls back to the package name when there is no display name', async () => {
      render({ name: 'homebridge-example', displayName: '' })

      void card().disablePlugin(card().plugin())
      await settle()

      expect(modal.dataFor(DISABLE_PLUGIN_MODAL_DATA)?.pluginName).toBe('homebridge-example')
    })

    it('disables the plugin once confirmed', async () => {
      render({ name: 'homebridge-example' })

      void card().disablePlugin(card().plugin())
      await settle()
      modal.opened[0].ref.close()
      await settle()

      expect(api.lastCall('put')?.url).toBe('/config-editor/plugin/homebridge-example/disable')
      expect(card().plugin().disabled).toBe(true)
    })

    it('url-encodes a scoped plugin name', async () => {
      render({ name: '@scope/homebridge-example' })

      void card().disablePlugin(card().plugin())
      await settle()
      modal.opened[0].ref.close()
      await settle()

      expect(api.lastCall('put')?.url).toBe('/config-editor/plugin/%40scope%2Fhomebridge-example/disable')
    })

    it('forgets the cached plugin list, so the page reflects the change', async () => {
      render({ name: 'homebridge-example' })

      void card().disablePlugin(card().plugin())
      await settle()
      modal.opened[0].ref.close()
      await settle()

      expect(pluginsCache.invalidate).toHaveBeenCalled()
    })

    it('stops the child bridges it was running on', async () => {
      const bridge = makeChildBridge({ username: '0E:11:22:33:44:55', status: 'ok' })
      render({ name: 'homebridge-example', isConfigured: true, hasChildBridges: true }, [bridge])

      void card().disablePlugin(card().plugin())
      await settle()
      modal.opened[0].ref.close()
      await settle()

      expect(ws.namespace('child-bridges').requests.map(r => r.resource)).toContain('stop-child-bridge')
    })

    it('asks for a restart afterwards', async () => {
      render({ name: 'homebridge-example' })

      void card().disablePlugin(card().plugin())
      await settle()
      modal.opened[0].ref.close()
      await settle()

      expect(modal.lastOpened()!.content).toBe(RestartHomebridgeComponent)
    })

    it('changes nothing when the prompt is dismissed', async () => {
      render({ name: 'homebridge-example' })

      void card().disablePlugin(card().plugin())
      await settle()
      modal.opened[0].ref.dismiss()
      await settle()

      expect(api.callsTo('put')).toEqual([])
      expect(card().plugin().disabled).toBeFalsy()
    })

    it('says so when the plugin cannot be disabled', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {})
      api.fail('put', /disable/, new Error('config not writable'))
      render({ name: 'homebridge-example' })

      void card().disablePlugin(card().plugin())
      await settle()
      modal.opened[0].ref.close()
      await settle()

      expect(toastr.error).toHaveBeenCalledWith('plugins.disable.error', 'toast.title_error')
      expect(card().plugin().disabled).toBeFalsy()
    })

    it('confirms before enabling, naming the plugin', async () => {
      render({ name: 'homebridge-example', displayName: 'Example', disabled: true })

      void card().enablePlugin(card().plugin())
      await settle()

      expect(modal.lastOpened()!.content).toBe(ConfirmComponent)
      expect(modal.dataFor(CONFIRM_MODAL_DATA)).toMatchObject({ title: 'homebridge-example' })
    })

    it('enables the plugin once confirmed', async () => {
      render({ name: 'homebridge-example', disabled: true })

      void card().enablePlugin(card().plugin())
      await settle()
      modal.opened[0].ref.close()
      await settle()

      expect(api.lastCall('put')?.url).toBe('/config-editor/plugin/homebridge-example/enable')
      expect(card().plugin().disabled).toBe(false)
    })

    it('starts the child bridges again', async () => {
      const bridge = makeChildBridge({ username: '0E:11:22:33:44:55', status: 'down' })
      render({ name: 'homebridge-example', disabled: true, isConfigured: true, hasChildBridges: true }, [bridge])

      void card().enablePlugin(card().plugin())
      await settle()
      modal.opened[0].ref.close()
      await settle()

      expect(ws.namespace('child-bridges').requests.map(r => r.resource)).toContain('start-child-bridge')
    })

    it('says so when the plugin cannot be enabled', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {})
      api.fail('put', /enable/, new Error('config not writable'))
      render({ name: 'homebridge-example', disabled: true })

      void card().enablePlugin(card().plugin())
      await settle()
      modal.opened[0].ref.close()
      await settle()

      expect(toastr.error).toHaveBeenCalledWith('plugins.enable.error', 'toast.title_error')
    })
  })

  describe('acting on the child bridges', () => {
    function card() {
      return fixture.componentInstance
    }

    it('sends the action to every bridge of the plugin', async () => {
      const bridges = [
        makeChildBridge({ username: '0E:11:22:33:44:55' }),
        makeChildBridge({ username: 'AA:BB:CC:DD:EE:FF' }),
      ]
      render({ isConfigured: true, hasChildBridges: true }, bridges)

      await card().doChildBridgeAction('restart')

      const requests = ws.namespace('child-bridges').requests
      expect(requests.map(r => r.payload)).toEqual(['0E:11:22:33:44:55', 'AA:BB:CC:DD:EE:FF'])
      expect(requests.every(r => r.resource === 'restart-child-bridge')).toBe(true)
    })

    it('shows the card as busy while it works', async () => {
      vi.useFakeTimers()
      render({ isConfigured: true, hasChildBridges: true }, [makeChildBridge()])

      const pending = card().doChildBridgeAction('restart')
      expect(card().childBridgeRestartInProgress()).toBe(true)

      await pending
      await vi.advanceTimersByTimeAsync(12000)
      expect(card().childBridgeRestartInProgress()).toBe(false)
      vi.useRealTimers()
    })

    it.each([
      ['restart', 12000],
      ['stop', 6000],
      ['start', 1000],
    ])('waits the %s settling time before saying it is done', async (action, wait) => {
      // A bridge takes time to come back up, and the card would otherwise offer
      // the action again while it is still restarting
      vi.useFakeTimers()
      render({ isConfigured: true, hasChildBridges: true }, [makeChildBridge()])

      await card().doChildBridgeAction(action as any)
      await vi.advanceTimersByTimeAsync(wait - 1)
      expect(card().childBridgeRestartInProgress()).toBe(true)

      await vi.advanceTimersByTimeAsync(1)
      expect(card().childBridgeRestartInProgress()).toBe(false)
      vi.useRealTimers()
    })

    it('says so when a bridge will not answer', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {})
      render({ isConfigured: true, hasChildBridges: true }, [makeChildBridge()])
      ws.namespace('child-bridges').socket.respondTo('restart-child-bridge', () => {
        throw new Error('socket error')
      })

      await card().doChildBridgeAction('restart')

      expect(toastr.error).toHaveBeenCalled()
      expect(card().childBridgeRestartInProgress()).toBe(false)
    })
  })

  describe('the plugin log and the info panels', () => {
    function card() {
      return fixture.componentInstance
    }

    it('opens the log with the plugin and its bridges', async () => {
      // The log is filtered per bridge, so it needs both
      const bridge = makeChildBridge({ username: '0E:11:22:33:44:55' })
      render({ name: 'homebridge-example', isConfigured: true, hasChildBridges: true }, [bridge])

      card().viewPluginLog()

      expect(modal.lastOpened()!.content).toBe(PluginLogsComponent)
      expect(modal.dataFor(PLUGIN_LOGS_MODAL_DATA)?.plugin.name).toBe('homebridge-example')
      expect(modal.dataFor(PLUGIN_LOGS_MODAL_DATA)?.childBridges).toHaveLength(1)
    })

    it('opens the log wide, because log lines are long', () => {
      render({ name: 'homebridge-example' })

      card().viewPluginLog()

      expect(modal.lastOpened()!.options).toMatchObject({ size: 'xl', backdrop: 'static' })
    })

    it('opens the funding panel for the plugin asked about', () => {
      render({ name: 'homebridge-example' })

      card().openFundingModal(card().plugin())

      expect(modal.lastOpened()!.content).toBe(DonateComponent)
      expect(modal.dataFor(PLUGIN_MODAL_DATA)?.plugin.name).toBe('homebridge-example')
    })

    it('opens the plugin information panel', () => {
      render({ name: 'homebridge-example' })

      card().pluginInfoModal(card().plugin())

      expect(modal.lastOpened()!.content).toBe(PluginInfoComponent)
      expect(modal.dataFor(PLUGIN_MODAL_DATA)?.plugin.name).toBe('homebridge-example')
    })
  })

  describe('what the card hands to the plugin service', () => {
    function card() {
      return fixture.componentInstance
    }

    it('asks for an update to the latest version', () => {
      render({ name: 'homebridge-example', latestVersion: '2.0.0' })

      card().checkAndUpdatePlugin()

      expect(managePlugins.checkAndUpdatePlugin).toHaveBeenCalledWith(card().plugin(), '2.0.0')
    })

    it.each([
      ['the settings', 'openSettings', 'settings'],
      ['the bridge settings', 'openBridgeSettings', 'bridgeSettings'],
      ['the external accessories', 'openExternalAccessories', 'externalAccessories'],
      ['the scope switch', 'switchToScoped', 'switchToScoped'],
      ['the version picker', 'installAlternateVersion', 'installAlternateVersion'],
      ['the json editor', 'openJsonEditor', 'jsonEditor'],
    ])('passes on %s', (_label, method, expected) => {
      render({ name: 'homebridge-example' })

      ;(card() as any)[method]()

      expect(managePlugins[expected]).toHaveBeenCalledWith(card().plugin())
    })

    it('hands the uninstall its child bridges as well', () => {
      // They have to be torn down with it
      const bridge = makeChildBridge({ username: '0E:11:22:33:44:55' })
      render({ name: 'homebridge-example', isConfigured: true, hasChildBridges: true }, [bridge])

      card().uninstallPlugin()

      expect(managePlugins.uninstallPlugin).toHaveBeenCalledWith(card().plugin(), expect.arrayContaining([bridge]))
    })

    it('hands the bridge reset the bridges to reset', () => {
      const bridge = makeChildBridge({ username: '0E:11:22:33:44:55' })
      render({ isConfigured: true, hasChildBridges: true }, [bridge])

      card().resetChildBridges()

      expect(managePlugins.resetChildBridges).toHaveBeenCalledWith(expect.arrayContaining([bridge]))
    })
  })

  describe('the plugin icon and name', () => {
    it('falls back to the homebridge icon when a plugin has none', () => {
      render({ icon: undefined })

      expect(fixture.componentInstance.plugin().icon).toBe('assets/hb-icon.png')
    })

    it('falls back when the icon it was given will not load', () => {
      render({ icon: 'https://example.com/gone.png' })

      fixture.componentInstance.handleIconError()

      expect(fixture.componentInstance.plugin().icon).toBe('assets/hb-icon.png')
    })

    it('drops the homebridge prefix on a narrow screen', () => {
      // "Homebridge Example" wraps onto two lines on a phone; "Example" does not
      TestBed.overrideProvider(MobileDetectService, { useValue: { detect: { mobile: () => 'iPhone' } } })

      render({ displayName: 'Homebridge Example' })

      expect(fixture.componentInstance.plugin().displayName).toBe('Example')
    })

    it('keeps the full name on a desktop', () => {
      render({ displayName: 'Homebridge Example' })

      expect(fixture.componentInstance.plugin().displayName).toBe('Homebridge Example')
    })

    it('leaves a name that does not start with homebridge alone', () => {
      TestBed.overrideProvider(MobileDetectService, { useValue: { detect: { mobile: () => 'iPhone' } } })

      render({ displayName: 'Example Plugin' })

      expect(fixture.componentInstance.plugin().displayName).toBe('Example Plugin')
    })
  })
})

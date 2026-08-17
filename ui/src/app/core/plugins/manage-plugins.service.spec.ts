import type { Plugin } from '@/app/core/plugins/manage-plugins.interfaces'
import type { FakeApi, FakeModalService, FakeSettings, FakeToastr } from '@/testing'

import { TestBed } from '@angular/core/testing'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { RestartHomebridgeComponent } from '@/app/core/components/restart-homebridge/restart-homebridge.component'
import {
  MANAGE_PLUGIN_MODAL_DATA,
  MANAGE_VERSION_MODAL_DATA,
  PLUGIN_BRIDGE_MODAL_DATA,
  PLUGIN_COMPATIBILITY_MODAL_DATA,
  PLUGIN_EXTERNALS_MODAL_DATA,
  PLUGIN_MODAL_DATA,
  RESET_ACCESSORIES_MODAL_DATA,
  SWITCH_TO_SCOPED_MODAL_DATA,
  UNINSTALL_PLUGIN_MODAL_DATA,
} from '@/app/core/modal-data-tokens'
import { CustomPluginsService } from '@/app/core/plugins/custom-plugins/custom-plugins.service'
import { ManagePluginComponent } from '@/app/core/plugins/manage-plugin/manage-plugin.component'
import { ManagePluginsService } from '@/app/core/plugins/manage-plugins.service'
import { ManageVersionComponent } from '@/app/core/plugins/manage-version/manage-version.component'
import { ManualConfigComponent } from '@/app/core/plugins/manual-config/manual-config.component'
import { PluginBridgeComponent } from '@/app/core/plugins/plugin-bridge/plugin-bridge.component'
import { PluginCompatibilityComponent } from '@/app/core/plugins/plugin-compatibility/plugin-compatibility.component'
import { PluginConfigComponent } from '@/app/core/plugins/plugin-config/plugin-config.component'
import { PluginExternalsComponent } from '@/app/core/plugins/plugin-externals/plugin-externals.component'
import { ResetAccessoriesComponent } from '@/app/core/plugins/reset-accessories/reset-accessories.component'
import { SwitchToScopedComponent } from '@/app/core/plugins/switch-to-scoped/switch-to-scoped.component'
import { UninstallPluginComponent } from '@/app/core/plugins/uninstall-plugin/uninstall-plugin.component'
import { fakeApi, makeSettings, modalServiceSpy, toastrStub } from '@/testing'
import { provideFakes, provideTestTranslate } from '@/testing/providers'

/**
 * The service every plugin action goes through: install, update, uninstall,
 * settings, child bridges, version picker.
 *
 * It owns three decisions worth pinning:
 *
 * ⚠️ **what happens after an install.** A plugin that already has config needs a
 * Homebridge restart; one that does not needs its settings opened, or the user
 * installs a plugin and nothing appears to happen. Getting this backwards leaves
 * either an unconfigured plugin or an unnecessary restart.
 *
 * ⚠️ **the compatibility gate.** A plugin declaring a newer Node or Homebridge
 * than the box is running must warn before installing, not after — an incompatible
 * plugin can stop Homebridge starting at all.
 *
 * ⚠️ **which settings UI opens.** A plugin can have a custom UI, a registered
 * custom UI, a schema-driven form or nothing but raw JSON, and they are picked in
 * that order.
 */
describe('managePluginsService', () => {
  let service: ManagePluginsService
  let api: FakeApi
  let modal: FakeModalService
  let settings: FakeSettings
  let toastr: FakeToastr
  let customPlugins: {
    plugins: Record<string, unknown>
    openCustomSettingsUi: ReturnType<typeof vi.fn>
    openSettings: ReturnType<typeof vi.fn>
  }

  /**
   * A plugin as the plugins page holds it.
   * @param overrides - fields to change
   */
  function makePlugin(overrides: Partial<Plugin> = {}): Plugin {
    return {
      name: 'homebridge-example',
      displayName: 'Example',
      installedVersion: '1.0.0',
      latestVersion: '1.1.0',
      isConfigured: true,
      settingsSchema: true,
      verifiedPlugin: true,
      verifiedPlusPlugin: false,
      disabled: false,
      ...overrides,
    } as Plugin
  }

  /** The aggregated payload every settings modal is built from. */
  function editorContext(overrides: Record<string, any> = {}) {
    return { alias: 'Example', configSchema: { pluginAlias: 'Example', schema: {} }, blocks: [], childBridges: [], ...overrides }
  }

  beforeEach(() => {
    TestBed.resetTestingModule()
    api = fakeApi()
    modal = modalServiceSpy()
    settings = makeSettings({ env: { nodeVersion: '22.0.0', homebridgeVersion: '1.8.0' } })
    toastr = toastrStub()
    customPlugins = { plugins: {}, openCustomSettingsUi: vi.fn(), openSettings: vi.fn() }

    TestBed.configureTestingModule({
      providers: [
        provideTestTranslate(),
        provideFakes({ api, modal, settings, toastr }),
        { provide: CustomPluginsService, useValue: customPlugins },
      ],
    })

    service = TestBed.inject(ManagePluginsService)
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.mocked(console.error).mockClear()
  })

  /** Let the awaits inside the service settle. */
  async function settle() {
    for (let tick = 0; tick < 12; tick += 1) {
      await Promise.resolve()
    }
  }

  describe('installing a plugin', () => {
    it('opens the manage modal with everything it needs to show', async () => {
      const plugin = makePlugin({ verifiedPlusPlugin: true, funding: [{ type: 'github', url: 'https://x' }] as any })

      void service.installPlugin(plugin, '1.1.0')
      await settle()

      expect(modal.lastOpened()!.content).toBe(ManagePluginComponent)
      expect(modal.dataFor(MANAGE_PLUGIN_MODAL_DATA)).toMatchObject({
        action: 'Install',
        pluginName: 'homebridge-example',
        pluginDisplayName: 'Example',
        targetVersion: '1.1.0',
        verifiedPlusPlugin: true,
      })
    })

    it('carries the funding links through, so the thank-you panel can show them', async () => {
      const funding = [{ type: 'github', url: 'https://github.com/sponsors/someone' }]

      void service.installPlugin(makePlugin({ funding: funding as any }), '1.1.0')
      await settle()

      expect(modal.dataFor(MANAGE_PLUGIN_MODAL_DATA)?.funding).toEqual(funding)
    })

    it('remembers that plugins are now installed', async () => {
      // ⚠️ /auth/settings only re-runs on login, a full restart or a UI plugin
      // save, so without this the accessories page keeps showing its
      // "no plugins yet" empty state after the very first install
      settings.env.hasInstalledPlugins = false

      void service.installPlugin(makePlugin(), '1.1.0')
      await settle()
      modal.lastOpened()!.ref.close({ action: 'just-installed', plugin: makePlugin() })
      await settle()

      expect(settings.env.hasInstalledPlugins).toBe(true)
    })

    it('asks for a restart when the new plugin already has config', async () => {
      void service.installPlugin(makePlugin({ isConfigured: true }), '1.1.0')
      await settle()
      modal.lastOpened()!.ref.close({ action: 'just-installed', plugin: makePlugin({ isConfigured: true }) })
      await settle()

      expect(modal.lastOpened()!.content).toBe(RestartHomebridgeComponent)
    })

    it('cannot be clicked away from the restart prompt', async () => {
      // Homebridge is half-updated at that point
      void service.installPlugin(makePlugin(), '1.1.0')
      await settle()
      modal.lastOpened()!.ref.close({ action: 'just-installed', plugin: makePlugin() })
      await settle()

      expect(modal.lastOpened()!.options).toMatchObject({ backdrop: 'static', keyboard: false })
    })

    it('opens the settings when the new plugin has no config yet', async () => {
      // Otherwise installing a plugin appears to do nothing at all
      api.respond('get', /editor-context/, editorContext())

      void service.installPlugin(makePlugin(), '1.1.0')
      await settle()
      modal.lastOpened()!.ref.close({ action: 'just-installed', plugin: makePlugin({ isConfigured: false }) })
      await settle()

      expect(modal.lastOpened()!.content).toBe(PluginConfigComponent)
    })

    it('does nothing further when the install modal is dismissed', async () => {
      void service.installPlugin(makePlugin(), '1.1.0')
      await settle()
      modal.lastOpened()!.ref.dismiss()
      await settle()

      expect(modal.opened).toHaveLength(1)
    })

    it('does nothing further when the modal closes without installing', async () => {
      void service.installPlugin(makePlugin(), '1.1.0')
      await settle()
      modal.lastOpened()!.ref.close({ action: 'cancelled' })
      await settle()

      expect(modal.opened).toHaveLength(1)
    })
  })

  describe('updating a plugin', () => {
    it('tells the modal which versions are involved', async () => {
      void service.updatePlugin(makePlugin({ installedVersion: '1.0.0', latestVersion: '2.0.0' }), '2.0.0')
      await settle()

      expect(modal.dataFor(MANAGE_PLUGIN_MODAL_DATA)).toMatchObject({
        action: 'Update',
        installedVersion: '1.0.0',
        latestVersion: '2.0.0',
        targetVersion: '2.0.0',
      })
    })

    it('passes on whether the plugin is disabled', async () => {
      // An update to a disabled plugin must not quietly re-enable it
      void service.updatePlugin(makePlugin({ disabled: true }), '2.0.0')
      await settle()

      expect(modal.dataFor(MANAGE_PLUGIN_MODAL_DATA)?.isDisabled).toBe(true)
    })

    it('asks for a restart afterwards', async () => {
      void service.updatePlugin(makePlugin(), '2.0.0')
      await settle()
      modal.lastOpened()!.ref.close({ action: 'just-installed', plugin: makePlugin({ isConfigured: true }) })
      await settle()

      expect(modal.lastOpened()!.content).toBe(RestartHomebridgeComponent)
    })

    it('does not claim plugins are installed for the first time', async () => {
      // An update is not a first install; the flag belongs to installPlugin
      settings.env.hasInstalledPlugins = false

      void service.updatePlugin(makePlugin(), '2.0.0')
      await settle()
      modal.lastOpened()!.ref.close({ action: 'just-installed', plugin: makePlugin() })
      await settle()

      expect(settings.env.hasInstalledPlugins).toBe(false)
    })

    it('checks compatibility before updating', async () => {
      void service.checkAndUpdatePlugin(makePlugin({ updateEngines: { node: '>=99.0.0' } as any }), '2.0.0')
      await settle()

      expect(modal.lastOpened()!.content).toBe(PluginCompatibilityComponent)
    })

    it('does not update when the compatibility warning is refused', async () => {
      void service.checkAndUpdatePlugin(makePlugin({ updateEngines: { node: '>=99.0.0' } as any }), '2.0.0')
      await settle()
      modal.lastOpened()!.ref.close(false)
      await settle()

      expect(modal.opened).toHaveLength(1)
    })

    it('goes ahead when the user accepts the warning', async () => {
      void service.checkAndUpdatePlugin(makePlugin({ updateEngines: { node: '>=99.0.0' } as any }), '2.0.0')
      await settle()
      modal.lastOpened()!.ref.close(true)
      await settle()

      expect(modal.lastOpened()!.content).toBe(ManagePluginComponent)
    })
  })

  describe('the compatibility gate', () => {
    it('says nothing when the plugin declares no requirements', async () => {
      expect(await service.checkHbAndNodeVersion(makePlugin(), 'install')).toBe(true)
      expect(modal.opened).toEqual([])
    })

    it('says nothing when the box already meets them', async () => {
      const plugin = makePlugin({ updateEngines: { node: '>=20.0.0', homebridge: '^1.6.0' } as any })

      expect(await service.checkHbAndNodeVersion(plugin, 'install')).toBe(true)
    })

    it('warns when the plugin wants a newer node', async () => {
      void service.checkHbAndNodeVersion(makePlugin({ updateEngines: { node: '>=24.0.0' } as any }), 'install')
      await settle()

      expect(modal.dataFor(PLUGIN_COMPATIBILITY_MODAL_DATA)).toMatchObject({ isValidNode: false, isValidHb: true, action: 'install' })
    })

    it('warns when the plugin wants a newer homebridge', async () => {
      void service.checkHbAndNodeVersion(makePlugin({ updateEngines: { homebridge: '^2.0.0' } as any }), 'update')
      await settle()

      expect(modal.dataFor(PLUGIN_COMPATIBILITY_MODAL_DATA)).toMatchObject({ isValidNode: true, isValidHb: false, action: 'update' })
    })

    it('reads a range rather than a plain version', async () => {
      // `^1.8.0` means 1.8.0 or newer, and the box is on 1.8.0 exactly
      const plugin = makePlugin({ updateEngines: { homebridge: '^1.8.0' } as any })

      expect(await service.checkHbAndNodeVersion(plugin, 'install')).toBe(true)
    })

    it('ignores a homebridge requirement when the version is unknown', async () => {
      settings.env.homebridgeVersion = undefined as any

      expect(await service.checkHbAndNodeVersion(makePlugin({ updateEngines: { homebridge: '^2.0.0' } as any }), 'install')).toBe(true)
    })

    it('refuses rather than guessing when the requirement cannot be read', async () => {
      // A plugin can publish anything in its engines field
      const result = await service.checkHbAndNodeVersion(makePlugin({ updateEngines: { node: 'not-a-version' } as any }), 'install')

      expect(result).toBe(false)
      expect(toastr.error).toHaveBeenCalled()
      expect(console.error).toHaveBeenCalled()
    })

    it('treats a dismissed warning as a no', async () => {
      const pending = service.checkHbAndNodeVersion(makePlugin({ updateEngines: { node: '>=24.0.0' } as any }), 'install')
      await settle()
      modal.lastOpened()!.ref.dismiss()

      expect(await pending).toBe(false)
    })
  })

  describe('picking a different version', () => {
    it('opens the version list for the plugin', async () => {
      void service.installAlternateVersion(makePlugin())
      await settle()

      expect(modal.lastOpened()!.content).toBe(ManageVersionComponent)
      expect(modal.dataFor(MANAGE_VERSION_MODAL_DATA)?.plugin.name).toBe('homebridge-example')
    })

    it('updates an installed plugin to the chosen version', async () => {
      void service.installAlternateVersion(makePlugin({ installedVersion: '1.0.0' }))
      await settle()
      modal.lastOpened()!.ref.close({ action: 'update', version: '0.9.0', engines: {} })
      await settle()

      expect(modal.dataFor(MANAGE_PLUGIN_MODAL_DATA)).toMatchObject({ action: 'Update', targetVersion: '0.9.0' })
    })

    it('installs a plugin that is not installed yet', async () => {
      void service.installAlternateVersion(makePlugin({ installedVersion: undefined as any }))
      await settle()
      modal.lastOpened()!.ref.close({ action: 'install', version: '0.9.0', engines: {} })
      await settle()

      expect(modal.dataFor(MANAGE_PLUGIN_MODAL_DATA)).toMatchObject({ action: 'Install', targetVersion: '0.9.0' })
    })

    it('offers a way back to the version list', async () => {
      // So a user who picked the wrong version is not sent back to the start
      const plugin = makePlugin()

      void service.installAlternateVersion(plugin)
      await settle()
      modal.lastOpened()!.ref.close({ action: 'update', version: '0.9.0', engines: {} })
      await settle()

      expect(modal.dataFor(MANAGE_PLUGIN_MODAL_DATA)?.backToVersionModal).toBe(plugin)
    })

    it('checks the engines of the version being chosen, not the latest one', async () => {
      // Rolling back to an old version has to be judged by that version's
      // requirements
      void service.installAlternateVersion(makePlugin())
      await settle()
      modal.lastOpened()!.ref.close({ action: 'update', version: '0.9.0', engines: { node: '>=24.0.0' } })
      await settle()

      expect(modal.lastOpened()!.content).toBe(PluginCompatibilityComponent)
    })

    it('takes the homebridge route for homebridge itself', async () => {
      void service.installAlternateVersion(makePlugin({ name: 'homebridge', displayName: 'Homebridge' }))
      await settle()
      modal.lastOpened()!.ref.close({ action: 'update', version: '1.9.0', engines: {} })
      await settle()

      // No isConfigured or funding on this one: homebridge is not a plugin
      expect(modal.dataFor(MANAGE_PLUGIN_MODAL_DATA)).toMatchObject({ action: 'Update', pluginName: 'homebridge' })
      expect(modal.dataFor(MANAGE_PLUGIN_MODAL_DATA)?.isConfigured).toBeUndefined()
    })

    it('does nothing when the version list is dismissed', async () => {
      void service.installAlternateVersion(makePlugin())
      await settle()
      modal.lastOpened()!.ref.dismiss()
      await settle()

      expect(modal.opened).toHaveLength(1)
    })
  })

  describe('uninstalling a plugin', () => {
    it('hands the modal the child bridges it will have to remove', async () => {
      const childBridges = [{ identifier: 'abc', name: 'Example Bridge' }] as any[]

      void service.uninstallPlugin(makePlugin(), childBridges)
      await settle()

      expect(modal.lastOpened()!.content).toBe(UninstallPluginComponent)
      expect(modal.dataFor(UNINSTALL_PLUGIN_MODAL_DATA)?.childBridges).toBe(childBridges)
    })

    it('passes on whether orphaned accessories are kept', async () => {
      settings.keepOrphans = true

      void service.uninstallPlugin(makePlugin(), [])
      await settle()

      expect(modal.dataFor(UNINSTALL_PLUGIN_MODAL_DATA)?.keepOrphans).toBe(true)
    })

    it('loads the plugin editor context first, so the modal does not have to', async () => {
      api.respond('get', /editor-context/, editorContext({ alias: 'ExamplePlatform' }))

      void service.uninstallPlugin(makePlugin(), [])
      await settle()

      expect(modal.dataFor(UNINSTALL_PLUGIN_MODAL_DATA)?.editorContext).toMatchObject({ alias: 'ExamplePlatform' })
    })

    it('still opens when the context cannot be loaded', async () => {
      // An uninstall has to be possible even for a plugin whose schema is broken
      api.fail('get', /editor-context/, new Error('schema is not valid json'))

      void service.uninstallPlugin(makePlugin(), [])
      await settle()

      expect(modal.lastOpened()!.content).toBe(UninstallPluginComponent)
      expect(modal.dataFor(UNINSTALL_PLUGIN_MODAL_DATA)?.editorContext).toBeUndefined()
      expect(console.error).toHaveBeenCalled()
    })

    it('refreshes the plugin list once the uninstall finishes', async () => {
      const refreshed = vi.fn()
      service.onPluginListRefresh.subscribe(refreshed)

      void service.uninstallPlugin(makePlugin(), [])
      await settle()
      modal.lastOpened()!.ref.close()
      await settle()

      expect(refreshed).toHaveBeenCalled()
    })

    it('leaves the list alone when the uninstall is abandoned', async () => {
      const refreshed = vi.fn()
      service.onPluginListRefresh.subscribe(refreshed)

      void service.uninstallPlugin(makePlugin(), [])
      await settle()
      modal.lastOpened()!.ref.dismiss()
      await settle()

      expect(refreshed).not.toHaveBeenCalled()
    })
  })

  describe('opening the settings', () => {
    it('opens the schema form for a plugin with a schema', async () => {
      api.respond('get', /editor-context/, editorContext())

      void service.settings(makePlugin({ settingsSchema: true }))
      await settle()

      expect(modal.lastOpened()!.content).toBe(PluginConfigComponent)
      expect(modal.dataFor(PLUGIN_MODAL_DATA)?.schema).toMatchObject({ pluginAlias: 'Example' })
    })

    it('opens the raw json editor for a plugin without one', async () => {
      api.respond('get', /editor-context/, editorContext({ configSchema: null }))

      void service.settings(makePlugin({ settingsSchema: false }))
      await settle()

      expect(modal.lastOpened()!.content).toBe(ManualConfigComponent)
      expect(modal.dataFor(PLUGIN_MODAL_DATA)?.schema).toBeUndefined()
    })

    it('hands over to the plugin own ui when it declares one', async () => {
      // The plugin ships its own page; the standard form would ignore it
      api.respond('get', /editor-context/, editorContext({ configSchema: { customUi: true } }))
      const plugin = makePlugin()

      await service.settings(plugin)

      expect(customPlugins.openCustomSettingsUi).toHaveBeenCalled()
      expect(modal.opened).toEqual([])
    })

    it('hands over to a registered custom ui', async () => {
      api.respond('get', /editor-context/, editorContext())
      customPlugins.plugins['homebridge-example'] = { some: 'registration' }

      await service.settings(makePlugin())

      expect(customPlugins.openSettings).toHaveBeenCalled()
      expect(modal.opened).toEqual([])
    })

    it('says so and opens nothing when the schema cannot be loaded', async () => {
      // A form built from a half-loaded schema would silently drop fields, and
      // saving it would drop them from the config too
      api.fail('get', /editor-context/, new Error('plugin not found'))

      await service.settings(makePlugin())

      expect(modal.opened).toEqual([])
      expect(toastr.error).toHaveBeenCalledWith('plugins.toast_failed_to_load_plugin_schema', 'toast.title_error')
    })

    it('asks the server for that plugin context, url-encoding the name', async () => {
      // Scoped plugin names contain a slash
      api.respond('get', /editor-context/, editorContext())

      void service.settings(makePlugin({ name: '@scope/homebridge-example' }))
      await settle()

      expect(api.lastCall('get')?.url).toBe('/plugins/%40scope%2Fhomebridge-example/editor-context')
    })
  })

  describe('opening the json editor directly', () => {
    it('always opens the raw editor, schema or not', async () => {
      api.respond('get', /editor-context/, editorContext())

      void service.jsonEditor(makePlugin({ settingsSchema: true }))
      await settle()

      expect(modal.lastOpened()!.content).toBe(ManualConfigComponent)
    })

    it('passes the schema through so the editor can still validate', async () => {
      api.respond('get', /editor-context/, editorContext())

      void service.jsonEditor(makePlugin({ settingsSchema: true }))
      await settle()

      expect(modal.dataFor(PLUGIN_MODAL_DATA)?.schema).toMatchObject({ pluginAlias: 'Example' })
    })

    it('opens anyway when the context fails, with no toast', async () => {
      // This is the way out for a plugin whose schema is the problem, so it must
      // not be blocked by the schema failing to load
      api.fail('get', /editor-context/, new Error('schema is not valid json'))

      void service.jsonEditor(makePlugin())
      await settle()

      expect(modal.lastOpened()!.content).toBe(ManualConfigComponent)
      expect(toastr.error).not.toHaveBeenCalled()
      expect(console.error).toHaveBeenCalled()
    })
  })

  describe('the child bridge settings', () => {
    it('opens the bridge modal with the loaded context', async () => {
      api.respond('get', /editor-context/, editorContext({ childBridges: [{ identifier: 'abc' }] }))

      void service.bridgeSettings(makePlugin())
      await settle()

      expect(modal.lastOpened()!.content).toBe(PluginBridgeComponent)
      expect(modal.dataFor(PLUGIN_BRIDGE_MODAL_DATA)?.editorContext).toMatchObject({ childBridges: [{ identifier: 'abc' }] })
    })

    it('says it was opened straight after an install when it was', async () => {
      // The modal offers a restart rather than a quiet close in that case
      api.respond('get', /editor-context/, editorContext())

      void service.bridgeSettings(makePlugin(), true)
      await settle()

      expect(modal.dataFor(PLUGIN_BRIDGE_MODAL_DATA)?.justInstalled).toBe(true)
    })

    it('leaves the schema out for a plugin that has none', async () => {
      api.respond('get', /editor-context/, editorContext())

      void service.bridgeSettings(makePlugin({ settingsSchema: false }))
      await settle()

      expect(modal.dataFor(PLUGIN_BRIDGE_MODAL_DATA)?.schema).toBeUndefined()
    })

    it('refuses to open when the context cannot be loaded', async () => {
      api.fail('get', /editor-context/, new Error('plugin not found'))

      await service.bridgeSettings(makePlugin())

      expect(modal.opened).toEqual([])
      expect(toastr.error).toHaveBeenCalled()
    })

    it('refreshes the plugin list when the modal asks for it', async () => {
      const refreshed = vi.fn()
      service.onPluginListRefresh.subscribe(refreshed)
      api.respond('get', /editor-context/, editorContext())

      void service.bridgeSettings(makePlugin())
      await settle()
      modal.lastOpened()!.ref.close('refresh')
      await settle()

      expect(refreshed).toHaveBeenCalled()
    })

    it('leaves the list alone on any other outcome', async () => {
      const refreshed = vi.fn()
      service.onPluginListRefresh.subscribe(refreshed)
      api.respond('get', /editor-context/, editorContext())

      void service.bridgeSettings(makePlugin())
      await settle()
      modal.lastOpened()!.ref.close('restart')
      await settle()

      expect(refreshed).not.toHaveBeenCalled()
    })
  })

  describe('the other modals it opens', () => {
    it('shows the external accessories of a plugin', async () => {
      const plugin = makePlugin()

      void service.externalAccessories(plugin)
      await settle()

      expect(modal.lastOpened()!.content).toBe(PluginExternalsComponent)
      expect(modal.dataFor(PLUGIN_EXTERNALS_MODAL_DATA)?.plugin).toBe(plugin)
    })

    it('opens the bridge reset modal with the bridges to reset', async () => {
      const childBridges = [{ identifier: 'abc' }] as any[]

      await service.resetChildBridges(childBridges)

      expect(modal.lastOpened()!.content).toBe(ResetAccessoriesComponent)
      expect(modal.dataFor(RESET_ACCESSORIES_MODAL_DATA)?.childBridges).toBe(childBridges)
    })

    it('opens the switch-to-scoped modal for a renamed plugin', async () => {
      const plugin = makePlugin({ name: 'homebridge-example' })

      await service.switchToScoped(plugin)

      expect(modal.lastOpened()!.content).toBe(SwitchToScopedComponent)
      expect(modal.dataFor(SWITCH_TO_SCOPED_MODAL_DATA)?.plugin).toBe(plugin)
    })

    it('opens every one of them as a large modal that cannot be clicked away', async () => {
      // All of them either change what is installed or restart something
      await service.switchToScoped(makePlugin())

      expect(modal.lastOpened()!.options).toMatchObject({ size: 'lg', backdrop: 'static' })
    })
  })
})

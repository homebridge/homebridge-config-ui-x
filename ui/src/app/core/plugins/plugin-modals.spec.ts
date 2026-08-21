import type { FakeApi, FakeCache, FakeModalService, FakeSettings } from '@/testing'

import { provideHttpClient } from '@angular/common/http'
import { provideHttpClientTesting } from '@angular/common/http/testing'
import { TestBed } from '@angular/core/testing'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { PluginsCacheService } from '@/app/core/caching/plugins-cache.service'
import { ConfirmComponent } from '@/app/core/components/confirm/confirm.component'
import {
  CONFIRM_MODAL_DATA,
  MANAGE_PLUGIN_MODAL_DATA,
  MANAGE_VERSION_MODAL_DATA,
  PLUGIN_LOGS_MODAL_DATA,
  UNINSTALL_PLUGIN_MODAL_DATA,
} from '@/app/core/modal-data-tokens'
import { ManagePluginComponent } from '@/app/core/plugins/manage-plugin/manage-plugin.component'
import { ManageVersionComponent } from '@/app/core/plugins/manage-version/manage-version.component'
import { PluginLogsComponent } from '@/app/core/plugins/plugin-logs/plugin-logs.component'
import { UninstallPluginComponent } from '@/app/core/plugins/uninstall-plugin/uninstall-plugin.component'
import { SAVE_AS } from '@/app/core/utilities/file-saver.factory'
import { LogService } from '@/app/core/utilities/log.service'
import { activeModalStub, cacheStub, fakeApi, fakeSaveAs, makeChildBridge, makePlugin, makeSettings, modalServiceSpy, toastrStub } from '@/testing'
import { provideFakes, provideTestTranslate } from '@/testing/providers'

/**
 * ⚠️ `saveAs` is substituted through `SAVE_AS`, not by mocking `file-saver`.
 * The unit-test builder bundles third-party imports into the app, so a module
 * mock never reaches the component - it would trigger a real download.
 */

/**
 * Three of the modals reached from a plugin's action menu.
 *
 * They share a shape worth knowing about: none of them installs, uninstalls or
 * updates anything itself. Each one gathers a decision and then either closes
 * with it, or opens ManagePluginComponent - the single place that actually runs
 * npm. So what these specs check is the decision, not the outcome.
 */
describe('plugin modals', () => {
  let saveAs: ReturnType<typeof fakeSaveAs>
  let api: FakeApi
  let settings: FakeSettings
  let toastr: ReturnType<typeof toastrStub>
  let activeModal: ReturnType<typeof activeModalStub>
  let modal: FakeModalService
  let pluginsCache: FakeCache<any[]>
  let log: { startTerminal: ReturnType<typeof vi.fn>, destroyTerminal: ReturnType<typeof vi.fn> }
  let onRefreshPluginList: ReturnType<typeof vi.fn>
  let onSettingsChange: ReturnType<typeof vi.fn>

  /**
   * Build one of the modals.
   *
   * `arrange` runs after the fakes are built but before the component is
   * created, so a response the modal fetches during its own initialisation can
   * still be registered.
   * @param type - the modal component
   * @param providers - the modal's data token, and anything else it needs
   * @param arrange - registers responses on the freshly built fakes
   */
  async function open<T>(
    type: new (...args: any[]) => T,
    providers: any[] = [],
    arrange?: () => void,
  ): Promise<T> {
    TestBed.resetTestingModule()
    api = fakeApi()
    settings = makeSettings()
    toastr = toastrStub()
    activeModal = activeModalStub()
    modal = modalServiceSpy()
    pluginsCache = cacheStub<any[]>([])
    log = { startTerminal: vi.fn(), destroyTerminal: vi.fn() }

    saveAs = fakeSaveAs()

    TestBed.configureTestingModule({
      providers: [
        { provide: SAVE_AS, useValue: saveAs },
        provideHttpClient(),
        provideHttpClientTesting(),
        provideTestTranslate(),
        provideFakes({ api, settings, toastr, activeModal, modal }),
        { provide: PluginsCacheService, useValue: pluginsCache },
        { provide: LogService, useValue: log },
        ...providers,
      ],
    })

    arrange?.()

    const fixture = TestBed.createComponent(type as any)
    fixture.detectChanges()
    await fixture.whenStable()

    // `whenStable` returns once the view is rendered, which is earlier than the
    // end of an `ngOnInit` promise chain - these modals all fetch something and
    // then set several signals from the result. Microtasks rather than a timer,
    // so this works under fake timers too
    for (let tick = 0; tick < 10; tick += 1) {
      await Promise.resolve()
    }

    return fixture.componentInstance as T
  }

  beforeEach(() => {
    // Built here, not in `open`: a modal's providers array is evaluated at the
    // call site before `open` runs, so anything rebuilt inside `open` would
    // hand the component the previous test's spy
    onRefreshPluginList = vi.fn()
    onSettingsChange = vi.fn()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('choosing a version to install', () => {
    const versionsResponse = {
      versions: {
        '1.0.0': { engines: { homebridge: '>=1.8.0' } },
        '2.0.0': { engines: { homebridge: '>=2.0.0' } },
        '2.1.0-beta.1': { engines: { homebridge: '>=2.0.0' } },
      },
      tags: { latest: '2.0.0', beta: '2.1.0-beta.1', next: '2.1.0-beta.1' },
    }

    /**
     * Build the version modal for a plugin.
     * @param plugin - overrides for the plugin fixture
     * @param arrange - registers responses on the freshly built fakes
     */
    function openVersions(plugin = makePlugin(), arrange?: () => void) {
      return open(
        ManageVersionComponent,
        [{
          provide: MANAGE_VERSION_MODAL_DATA,
          useValue: { plugin, onRefreshPluginList, onSettingsChange },
        }],
        () => {
          api.respond('get', /\/plugins\/lookup\/.*\/versions$/, versionsResponse)
          arrange?.()
        },
      )
    }

    it('lists the versions newest first', async () => {
      const modalRef = await openVersions()

      // Reverse semver order, not string order: '10.0.0' has to come above
      // '9.0.0', which a plain sort gets backwards
      expect(modalRef.versions().map(v => v.version)).toEqual(['2.1.0-beta.1', '2.0.0', '1.0.0'])
    })

    it('orders the tag shortcuts by usefulness', async () => {
      const modalRef = await openVersions()

      expect(modalRef.versionsWithTags().map(v => v.tag)).toEqual(['latest', 'next', 'beta'])
    })

    it('puts a tag it does not recognise after the ones it does', async () => {
      // Plugins publish their own dist-tags, and an unknown one must not
      // displace `latest` at the front of the shortcuts
      const modalRef = await openVersions(makePlugin(), () => {
        api.respond('get', /\/plugins\/lookup\/.*\/versions$/, {
          versions: versionsResponse.versions,
          tags: { legacy: '1.0.0', latest: '2.0.0', beta: '2.1.0-beta.1' },
        })
      })

      expect(modalRef.versionsWithTags().map(v => v.tag)).toEqual(['latest', 'beta', 'legacy'])
    })

    it('records no engine requirement for a version npm no longer describes', async () => {
      // The kept version is built here rather than read from npm, so a plugin
      // with no engines field must leave the requirement empty rather than
      // rendering an undefined one
      const modalRef = await openVersions(makePlugin({ installedVersion: '0.9.0', engines: undefined }))

      expect(modalRef.versions().find(v => v.version === '0.9.0')?.engines).toBeNull()
    })

    it('lists one version once per tag it carries', async () => {
      const modalRef = await openVersions()

      // A single release is often both 'next' and 'beta', and each needs its
      // own button
      const beta = modalRef.versionsWithTags().filter(v => v.version === '2.1.0-beta.1')
      expect(beta.map(v => v.tag)).toEqual(['next', 'beta'])
    })

    it('starts on the installed version', async () => {
      const modalRef = await openVersions(makePlugin({ installedVersion: '1.0.0' }))

      expect(modalRef.versionSelect).toBe('1.0.0')
    })

    it('keeps a version npm no longer lists', async () => {
      const modalRef = await openVersions(makePlugin({ installedVersion: '0.9.0' }))

      // An unpublished or deprecated version is still what the user has
      // installed, so it has to appear or the dropdown shows the wrong thing
      expect(modalRef.versions().map(v => v.version)).toContain('0.9.0')
      expect(modalRef.versionSelect).toBe('0.9.0')
    })

    it('falls back to the latest tag when the chosen version is gone', async () => {
      const modalRef = await openVersions(makePlugin({ installedVersion: undefined, latestVersion: '9.9.9' }))

      expect(modalRef.versionSelect).toBe('2.0.0')
    })

    it('closes with an alternate install for a plugin already installed', async () => {
      const modalRef = await openVersions(makePlugin({ installedVersion: '1.0.0' }))

      modalRef.doInstall('2.0.0')

      // The caller uses `action` to pick its wording and its npm command, and
      // 'alternate' is what marks a deliberate downgrade or sidegrade
      expect(activeModal.close).toHaveBeenCalledWith({
        name: 'homebridge-test',
        version: '2.0.0',
        engines: { homebridge: '>=2.0.0' },
        action: 'alternate',
      })
    })

    it('closes with a plain install for a plugin not yet installed', async () => {
      const modalRef = await openVersions(makePlugin({ installedVersion: undefined }))

      modalRef.doInstall('2.0.0')

      expect((activeModal.close as any).mock.calls[0][0].action).toBe('install')
    })

    it('closes itself when the versions cannot be looked up', async () => {
      const modalRef = await openVersions(makePlugin(), () =>
        api.fail('get', /\/plugins\/lookup\//, new Error('npm unreachable')))

      // There is nothing to choose from, so an empty dropdown would just be
      // confusing
      expect(activeModal.dismiss).toHaveBeenCalled()
      expect(modalRef.loading()).toBe(true)
    })

    it('escapes a scoped plugin name in the lookup url', async () => {
      await openVersions(makePlugin({ name: '@homebridge-plugins/homebridge-test' }))

      expect(api.lastCall('get')?.url).toBe('/plugins/lookup/%40homebridge-plugins%2Fhomebridge-test/versions')
    })
  })

  describe('changing what updates a plugin offers', () => {
    const versionsResponse = { versions: { '1.0.0': {} }, tags: { latest: '1.0.0' } }

    /**
     * Build the version modal and change its update preference.
     * @param plugin - overrides for the plugin fixture
     * @param preference - the new update policy
     * @param env - settings env overrides
     */
    async function choose(plugin: ReturnType<typeof makePlugin>, preference: any, env: Record<string, any> = {}) {
      const modalRef = await open(
        ManageVersionComponent,
        [{
          provide: MANAGE_VERSION_MODAL_DATA,
          useValue: { plugin, onRefreshPluginList, onSettingsChange },
        }],
        () => {
          api.respond('get', /\/plugins\/lookup\//, versionsResponse)
          Object.assign(settings.env, env)
        },
      )
      api.clearCalls()
      modalRef.updatePreferenceControl.setValue(preference)
      await vi.advanceTimersByTimeAsync(500)
      return modalRef
    }

    beforeEach(() => {
      vi.useFakeTimers()
    })

    it('reads a regular plugin as hidden when it is on the hide list', async () => {
      const modalRef = await open(
        ManageVersionComponent,
        [{ provide: MANAGE_VERSION_MODAL_DATA, useValue: { plugin: makePlugin(), onRefreshPluginList } }],
        () => {
          api.respond('get', /\/plugins\/lookup\//, versionsResponse)
          settings.env.plugins = { hideUpdatesFor: ['homebridge-test'] }
        },
      )

      expect(modalRef.updatePreferenceControl.value).toBe('none')
    })

    it('reads a regular plugin as beta when it is on the betas list', async () => {
      const modalRef = await open(
        ManageVersionComponent,
        [{ provide: MANAGE_VERSION_MODAL_DATA, useValue: { plugin: makePlugin(), onRefreshPluginList } }],
        () => {
          api.respond('get', /\/plugins\/lookup\//, versionsResponse)
          settings.env.plugins = { showBetasFor: ['homebridge-test'] }
        },
      )

      expect(modalRef.updatePreferenceControl.value).toBe('beta')
    })

    it('reads homebridge from its own policy key', async () => {
      const modalRef = await open(
        ManageVersionComponent,
        [{ provide: MANAGE_VERSION_MODAL_DATA, useValue: { plugin: makePlugin({ name: 'homebridge' }), onRefreshPluginList } }],
        () => {
          api.respond('get', /\/plugins\/lookup\//, versionsResponse)
          settings.env.homebridgeUpdatePolicy = 'major'
        },
      )

      // Homebridge and the UI use a single policy string rather than the two
      // lists regular plugins use, because they have a 'major' option
      expect(modalRef.updatePreferenceControl.value).toBe('major')
    })

    it('adds a regular plugin to the hide list', async () => {
      await choose(makePlugin(), 'none', { plugins: { hideUpdatesFor: ['homebridge-aaa'] } })

      expect(api.lastCall('put', '/config-editor/ui/plugins/hide-updates-for')?.body).toEqual({
        body: ['homebridge-aaa', 'homebridge-test'],
      })
    })

    it('takes a plugin off the hide list when updates are wanted again', async () => {
      await choose(makePlugin(), 'all', { plugins: { hideUpdatesFor: ['homebridge-test'] } })

      expect(api.lastCall('put', '/config-editor/ui/plugins/hide-updates-for')?.body).toEqual({ body: [] })
    })

    it('moves a plugin between the two lists rather than adding to both', async () => {
      await choose(makePlugin(), 'beta', { plugins: { hideUpdatesFor: ['homebridge-test'] } })

      // 'none' and 'beta' are mutually exclusive choices in one dropdown, so
      // switching has to clear the other list
      expect(api.lastCall('put', '/config-editor/ui/plugins/hide-updates-for')?.body).toEqual({ body: [] })
      expect(api.lastCall('patch', '/config-editor/ui')?.body).toEqual({
        'plugins.showBetasFor': ['homebridge-test'],
      })
    })

    it('writes the homebridge policy to its own key', async () => {
      await choose(makePlugin({ name: 'homebridge' }), 'major')

      expect(api.lastCall('patch', '/config-editor/ui')?.body).toEqual({ homebridgeUpdatePolicy: 'major' })
      expect(api.callsTo('put', '/config-editor/ui/plugins/hide-updates-for')).toHaveLength(0)
    })

    it('writes the ui policy to its own key', async () => {
      await choose(makePlugin({ name: 'homebridge-config-ui-x' }), 'none')

      expect(api.lastCall('patch', '/config-editor/ui')?.body).toEqual({ homebridgeUiUpdatePolicy: 'none' })
    })

    it('clears both caches so the next check re-reads npm', async () => {
      await choose(makePlugin(), 'beta')

      // The server caches the version it found, and so does the UI - a stale
      // either side means the dropdown says beta while the card says otherwise
      expect(api.callsTo('post', '/plugins/clear-cache')).toHaveLength(1)
      expect(pluginsCache.invalidate).toHaveBeenCalled()
    })

    it('tells the pages that show update badges to refresh', async () => {
      await choose(makePlugin(), 'beta')

      expect(onRefreshPluginList).toHaveBeenCalled()
      expect(onSettingsChange).toHaveBeenCalled()
    })

    it('puts the dropdown back when saving fails', async () => {
      const modalRef = await open(
        ManageVersionComponent,
        [{ provide: MANAGE_VERSION_MODAL_DATA, useValue: { plugin: makePlugin(), onRefreshPluginList } }],
        () => {
          api.respond('get', /\/plugins\/lookup\//, versionsResponse)
          api.fail('put', '/config-editor/ui/plugins/hide-updates-for', new Error('read only'))
        },
      )

      modalRef.updatePreferenceControl.setValue('none')
      await vi.advanceTimersByTimeAsync(500)

      // Otherwise the dropdown claims a setting the config never received
      expect(modalRef.updatePreferenceControl.value).toBe('all')
      expect(toastr.at('error')).toHaveLength(1)
      expect(onRefreshPluginList).not.toHaveBeenCalled()
    })
  })

  describe('uninstalling a plugin', () => {
    /**
     * Build the uninstall modal.
     * @param data - overrides for the modal data
     * @param arrange - registers responses on the freshly built fakes
     */
    function openUninstall(data: Record<string, any> = {}, arrange?: () => void) {
      return open(
        UninstallPluginComponent,
        [{
          provide: UNINSTALL_PLUGIN_MODAL_DATA,
          useValue: { plugin: makePlugin(), onRefreshPluginList, ...data },
        }],
        () => {
          api.respond('get', /\/plugins\/alias\//, { pluginType: 'platform', pluginAlias: 'TestPlatform' })
          arrange?.()
        },
      )
    }

    it('offers to remove the config by default', async () => {
      const modalRef = await openUninstall()

      expect(modalRef.removeConfig()).toBe(true)
      expect(modalRef.isConfiguredDynamicPlatform()).toBe(true)
    })

    it('keeps the config by default when orphans are being kept', async () => {
      const modalRef = await openUninstall({ keepOrphans: true })

      // With keepAccessories on, leaving the config in place is what preserves
      // the accessories in the Home app, so that becomes the safer default
      expect(modalRef.removeConfig()).toBe(false)
      expect(modalRef.willKeepAccessoriesInCache()).toBe(true)
    })

    it('warns that the setting will be overridden if the config goes anyway', async () => {
      const modalRef = await openUninstall({ keepOrphans: true })

      modalRef.removeConfig.set(true)

      // Removing the config makes keepAccessories moot, and the user needs to
      // be told rather than discover their rooms are empty
      expect(modalRef.settingTranslationKey()).toBe('plugins.manage.confirm_disable_setting_override')
      expect(modalRef.willKeepAccessoriesInCache()).toBe(false)
    })

    it('hides the cleanup warning only when nothing is being removed', async () => {
      const modalRef = await openUninstall({ keepOrphans: true })
      expect(modalRef.shouldShowCleanupAlert()).toBe(false)

      modalRef.removeConfig.set(true)
      expect(modalRef.shouldShowCleanupAlert()).toBe(true)
    })

    it('ties the child bridge choice to the config choice', async () => {
      const modalRef = await openUninstall({ childBridges: [makeChildBridge()] })

      modalRef.removeConfig.set(false)
      modalRef.onRemoveConfigChange()

      // A child bridge with no config behind it is an orphan the user cannot
      // reach from anywhere in the UI
      expect(modalRef.removeChildBridges()).toBe(false)
    })

    it('empties the config and re-enables the plugin before it goes', async () => {
      const modalRef = await openUninstall()

      await modalRef.doUninstall()

      expect(api.lastCall('post', '/config-editor/plugin/homebridge-test')?.body).toEqual([])
      // Leaving a removed plugin on the disabled list would block a later
      // reinstall from starting
      expect(api.callsTo('put', '/config-editor/plugin/homebridge-test/enable')).toHaveLength(1)
    })

    it('leaves the config alone when the user unticks it', async () => {
      const modalRef = await openUninstall()
      modalRef.removeConfig.set(false)

      await modalRef.doUninstall()

      expect(api.callsTo('post', '/config-editor/plugin/homebridge-test')).toHaveLength(0)
    })

    it('removes each child bridge pairing with the colons stripped', async () => {
      const modalRef = await openUninstall({
        childBridges: [makeChildBridge({ username: '0E:12:34:56:78:9A' }), makeChildBridge({ username: '0E:AA:BB:CC:DD:EE' })],
      })

      await modalRef.doUninstall()

      // The pairings endpoint keys on the id without separators
      expect(api.callsTo('delete').map(call => call.url)).toEqual([
        '/server/pairings/0E123456789A',
        '/server/pairings/0EAABBCCDDEE',
      ])
    })

    it('carries on uninstalling when a pairing cannot be removed', async () => {
      // ⚠️ The plugin still has to go. Stopping here would leave it installed with
      // its config already emptied, which is the worst of both
      vi.spyOn(console, 'error').mockImplementation(() => {})
      const modalRef = await openUninstall(
        { childBridges: [makeChildBridge()] },
        () => api.fail('delete', /\/server\/pairings\//, new Error('pairing not found')),
      )
      vi.mocked(toastr.error).mockClear()

      await modalRef.doUninstall()

      expect(toastr.error).toHaveBeenCalled()
      expect(modal.lastOpened()?.content).toBe(ManagePluginComponent)
    })

    it('hands over to the manage modal to do the actual uninstall', async () => {
      const modalRef = await openUninstall()

      await modalRef.doUninstall()

      expect(activeModal.dismiss).toHaveBeenCalled()
      expect(modal.lastOpened()?.content).toBe(ManagePluginComponent)
      expect(modal.dataFor(MANAGE_PLUGIN_MODAL_DATA)).toMatchObject({
        action: 'Uninstall',
        pluginName: 'homebridge-test',
      })
    })

    it('still uninstalls when clearing the config fails', async () => {
      const modalRef = await openUninstall({}, () =>
        api.fail('post', '/config-editor/plugin/homebridge-test', new Error('read only')))

      await modalRef.doUninstall()

      // Stopping here would leave the plugin installed and the user stuck; the
      // leftover config block is harmless once the plugin is gone
      expect(modal.lastOpened()?.content).toBe(ManagePluginComponent)
      expect(toastr.at('error')).toHaveLength(1)
    })

    it('uses the alias the editor already knows rather than asking again', async () => {
      const modalRef = await openUninstall({
        editorContext: { alias: { pluginType: 'accessory', pluginAlias: 'TestAccessory' } },
      })

      expect(api.callsTo('get', /\/plugins\/alias\//)).toHaveLength(0)
      // An accessory plugin is not a dynamic platform, so the keepAccessories
      // reasoning does not apply to it
      expect(modalRef.isConfiguredDynamicPlatform()).toBe(false)
    })

    it('stops loading even when the alias lookup fails', async () => {
      const modalRef = await openUninstall({}, () =>
        api.fail('get', /\/plugins\/alias\//, new Error('offline')))

      expect(modalRef.loading()).toBe(false)
      expect(toastr.at('error')).toHaveLength(1)
    })
  })

  describe('viewing a plugin log', () => {
    /**
     * Build the plugin log modal.
     * @param data - overrides for the modal data
     * @param arrange - registers responses on the freshly built fakes
     */
    function openLogs(data: Record<string, any> = {}, arrange?: () => void) {
      return open(
        PluginLogsComponent,
        [{ provide: PLUGIN_LOGS_MODAL_DATA, useValue: { plugin: makePlugin(), ...data } }],
        () => {
          api.respond('get', '/config-editor/plugin/homebridge-test', [{ platform: 'TestPlatform', name: 'Kitchen' }])
          arrange?.()
        },
      )
    }

    beforeEach(() => {
      vi.mocked(saveAs).mockClear()
    })

    it('filters the log by the name from the config, not the plugin name', async () => {
      await openLogs()

      // Homebridge tags each line with the configured `name`, which is what the
      // user typed and may be nothing like the plugin's own name
      expect(log.startTerminal).toHaveBeenCalledWith(expect.anything(), {}, expect.anything(), 'Kitchen')
    })

    it('falls back to the plugin name when the config has none', async () => {
      await openLogs({}, () => api.respond('get', '/config-editor/plugin/homebridge-test', [{ platform: 'TestPlatform' }]))

      expect(vi.mocked(log.startTerminal).mock.calls[0][3]).toBe('homebridge-test')
    })

    it('uses the fixed tag for the ui itself', async () => {
      await openLogs({ plugin: makePlugin({ name: 'homebridge-config-ui-x' }) }, () =>
        api.respond('get', '/config-editor/plugin/homebridge-config-ui-x', [{ platform: 'config' }]))

      // The UI logs under a display name that never appears in its config
      expect(vi.mocked(log.startTerminal).mock.calls[0][3]).toBe('Homebridge UI')
    })

    it('opens a read-only terminal', async () => {
      await openLogs()

      expect(settings.getTerminalOptions).toHaveBeenCalledWith({ disableStdin: true })
    })

    it('reuses the config the editor already loaded', async () => {
      await openLogs({ editorContext: { config: [{ platform: 'TestPlatform', name: 'Hallway' }] } })

      expect(api.callsTo('get', '/config-editor/plugin/homebridge-test')).toHaveLength(0)
      expect(vi.mocked(log.startTerminal).mock.calls[0][3]).toBe('Hallway')
    })

    it('closes itself when the config cannot be read', async () => {
      await openLogs({}, () => api.fail('get', '/config-editor/plugin/homebridge-test', new Error('offline')))

      expect(activeModal.dismiss).toHaveBeenCalled()
      expect(log.startTerminal).not.toHaveBeenCalled()
    })

    it('restarts each child bridge in turn', async () => {
      const modalRef = await openLogs({
        childBridges: [makeChildBridge({ username: '0E:11:11:11:11:11' }), makeChildBridge({ username: '0E:22:22:22:22:22' })],
      })

      await modalRef.restartChildBridges()

      expect(api.callsTo('put').map(call => call.url)).toEqual([
        '/server/restart/0E:11:11:11:11:11',
        '/server/restart/0E:22:22:22:22:22',
      ])
      expect(modalRef.midAction()).toBe(false)
    })

    it('re-enables the buttons when a restart fails', async () => {
      const modalRef = await openLogs(
        { childBridges: [makeChildBridge()] },
        () => api.fail('put', /\/server\/restart\//, new Error('not running')),
      )

      await modalRef.restartChildBridges()

      expect(modalRef.midAction()).toBe(false)
      expect(toastr.at('error')[0].message).toBe('plugins.manage.child_bridge_restart_failed')
    })

    it('reports a download the server refused', async () => {
      const modalRef = await openLogs({}, () => api.fail('get', /\/log\/download/, new Error('log unreadable')))
      vi.mocked(toastr.error).mockClear()

      const done = modalRef.downloadLogFile()
      modal.lastOpened()!.ref.close()
      await done

      expect(toastr.error).toHaveBeenCalled()
      expect(saveAs).not.toHaveBeenCalled()
      // ⚠️ Re-enabled, or the download button is dead for the rest of the modal
      expect(modalRef.midAction()).toBe(false)
    })

    it('tells the terminal to re-measure when the window is resized', async () => {
      // The modal is sized off the window, so a resize leaves the terminal drawn
      // at the old width with the text wrapping in the wrong place
      const modalRef = await openLogs()
      const resized = vi.fn()
      ;(modalRef as any).resizeEvent.subscribe(resized)

      modalRef.onWindowResize()

      expect(resized).toHaveBeenCalled()
    })

    /**
     * What a screen reader hears.
     *
     * ⚠️ **xterm writes its own live region and asks for it to be assertive**,
     * which interrupts the reader on every line a busy plugin logs. The page turns
     * it down to polite so the log can be read at the user's own pace.
     */
    describe('the log for a screen reader', () => {
      it('quietens the live region xterm sets up', async () => {
        const modalRef = await openLogs()
        const host = modalRef.termTarget()!.nativeElement as HTMLElement
        const live = document.createElement('div')
        live.setAttribute('aria-live', 'assertive')
        host.append(live)

        ;(modalRef as any).patchXtermLiveRegion()

        expect(live.getAttribute('aria-live')).toBe('polite')
        expect(live.getAttribute('role')).toBe('status')
        expect(live.getAttribute('aria-atomic')).toBe('true')
      })

      it('copes with xterm not having built its live region yet', async () => {
        // The patch is queued on a frame callback that can beat xterm to it
        const modalRef = await openLogs()

        expect(() => (modalRef as any).patchXtermLiveRegion()).not.toThrow()
      })
    })

    it('asks before downloading, because a log can contain secrets', async () => {
      const modalRef = await openLogs()

      const done = modalRef.downloadLogFile()

      // Logs routinely carry tokens and passwords, so this warning is the only
      // thing standing between the user and pasting one into a public issue
      expect(modal.lastOpened()?.content).toBe(ConfirmComponent)
      expect(modal.dataFor(CONFIRM_MODAL_DATA)?.message).toBe('logs.download_warning')

      modal.lastOpened()!.ref.dismiss('Dismiss')
      await done
    })

    it('downloads nothing when the warning is dismissed', async () => {
      const modalRef = await openLogs()

      const done = modalRef.downloadLogFile()
      modal.lastOpened()!.ref.dismiss('Dismiss')
      await done

      expect(saveAs).not.toHaveBeenCalled()
      expect(modalRef.midAction()).toBe(false)
    })

    it('keeps only the lines belonging to this plugin', async () => {
      const modalRef = await openLogs()
      api.respond('get', /\/log\/download/, {
        body: [
          '\u001B[37m[16/08/2026, 10:00:00]\u001B[39m \u001B[36m[Kitchen]\u001B[39m Kitchen line one',
          '  continuation of the kitchen line',
          '\u001B[37m[16/08/2026, 10:00:01]\u001B[39m \u001B[36m[Other Plugin]\u001B[39m not ours',
          '',
        ].join('\n'),
      })

      const done = modalRef.downloadLogFile()
      modal.lastOpened()!.ref.close()
      await done

      const written = await (vi.mocked(saveAs).mock.calls[0][0] as Blob).text()
      // A wrapped line has no tag of its own, so it is taken along until the
      // next tagged line appears
      expect(written).toContain('Kitchen line one')
      expect(written).toContain('continuation of the kitchen line')
      expect(written).not.toContain('not ours')
    })

    it('strips the colour codes out of the saved file', async () => {
      const modalRef = await openLogs()
      api.respond('get', /\/log\/download/, {
        body: '\u001B[37m[16/08/2026, 10:00:00]\u001B[39m \u001B[36m[Kitchen]\u001B[39m plain please',
      })

      const done = modalRef.downloadLogFile()
      modal.lastOpened()!.ref.close()
      await done

      const written = await (vi.mocked(saveAs).mock.calls[0][0] as Blob).text()
      expect(written).not.toContain('\u001B[')
      expect(vi.mocked(saveAs).mock.calls[0][1]).toBe('homebridge-test.log.txt')
    })

    it('asks for the log in colour so the tags can be matched', async () => {
      const modalRef = await openLogs()
      api.respond('get', /\/log\/download/, { body: '' })

      const done = modalRef.downloadLogFile()
      modal.lastOpened()!.ref.close()
      await done

      // The plugin tag is only identifiable by its colour code, so the colour
      // has to be requested and then stripped rather than never asked for
      expect(api.lastCall('get', /\/log\/download/)?.url).toContain('colour=yes')
    })

    it('re-enables the buttons when the download fails', async () => {
      const modalRef = await openLogs({}, () => api.fail('get', /\/log\/download/, new Error('no log file')))

      const done = modalRef.downloadLogFile()
      modal.lastOpened()!.ref.close()
      await done

      expect(modalRef.midAction()).toBe(false)
      expect(toastr.at('error')[0].message).toBe('logs.download.error')
    })

    it('tears the terminal down on close', async () => {
      await openLogs()

      TestBed.resetTestingModule()

      // The terminal holds a socket and a buffer; the log modal is opened and
      // closed repeatedly from the plugin cards
      expect(log.destroyTerminal).toHaveBeenCalled()
    })
  })
})

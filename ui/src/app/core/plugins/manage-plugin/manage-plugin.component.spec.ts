import type { FakeApi, FakeCache, FakeIoNamespace, FakeModalService, FakeSettings, FakeWs } from '@/testing'

import { TestBed } from '@angular/core/testing'
import { provideRouter, Router } from '@angular/router'
import { saveAs } from 'file-saver'
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { PluginsCacheService } from '@/app/core/caching/plugins-cache.service'
import { RestartHomebridgeComponent } from '@/app/core/components/restart-homebridge/restart-homebridge.component'
import { HB_V2_MODAL_DATA, MANAGE_PLUGIN_MODAL_DATA, MANAGE_VERSION_MODAL_DATA } from '@/app/core/modal-data-tokens'
import { ManagePluginComponent } from '@/app/core/plugins/manage-plugin/manage-plugin.component'
import { ManageVersionComponent } from '@/app/core/plugins/manage-version/manage-version.component'
import { PluginLogsComponent } from '@/app/core/plugins/plugin-logs/plugin-logs.component'
import { ChildBridgesService } from '@/app/core/utilities/child-bridges.service'
import { BackupService } from '@/app/modules/settings/backup/backup.service'
import { HbV2ModalComponent } from '@/app/modules/status/widgets/update-info-widget/hb-v2-modal/hb-v2-modal.component'
import { activeModalStub, cacheStub, fakeApi, fakeWs, makeChildBridge, makePlugin, makeSettings, modalServiceSpy, toastrStub } from '@/testing'
import { provideFakes, provideTestTranslate } from '@/testing/providers'

const { terminals } = vi.hoisted(() => ({ terminals: [] as any[] }))

// The component builds its terminal in the constructor, so this has to be
// mocked for the component to be creatable at all. `cols` and `rows` matter:
// they are sent to the server so npm's output wraps to the visible width
vi.mock('@xterm/xterm', () => ({
  Terminal: class {
    public written: string[] = []
    public cols = 80
    public rows = 24
    public loadAddon = vi.fn()
    public open = vi.fn()
    public reset = vi.fn()
    public dispose = vi.fn()

    constructor(public options: any) {
      terminals.push(this)
    }

    public write(data: string): void {
      this.written.push(data)
    }
  },
}))

vi.mock('@xterm/addon-fit', () => ({ FitAddon: class {
  public fit = vi.fn()
} }))
vi.mock('@xterm/addon-web-links', () => ({ WebLinksAddon: class {} }))
vi.mock('file-saver', () => ({ saveAs: vi.fn() }))

/**
 * The one modal in the app that runs npm.
 *
 * Everything else - the plugin cards, the version picker, the uninstall
 * confirmation - only decides what should happen and then opens this. So this is
 * the last point at which a wrong plugin name or version can be caught, and the
 * only place that knows whether the user needs to restart afterwards.
 *
 * Two things here are ordering rather than logic, and both have bitten before:
 * the caches must be invalidated before the plugins page is told to refresh, or
 * it reads the pre-install list; and updating the UI itself has to set a restart
 * flag before navigating, because the page is about to be replaced.
 */
describe('managePluginComponent', () => {
  let api: FakeApi
  let settings: FakeSettings
  let toastr: ReturnType<typeof toastrStub>
  let activeModal: ReturnType<typeof activeModalStub>
  let modal: FakeModalService
  let ws: FakeWs
  let io: FakeIoNamespace
  let pluginsCache: FakeCache<any[]>
  let childBridges: { getAll: ReturnType<typeof vi.fn>, invalidate: ReturnType<typeof vi.fn> }
  let backup: { downloadBackup: ReturnType<typeof vi.fn> }
  let navigate: ReturnType<typeof vi.fn>
  let onRefreshPluginList: ReturnType<typeof vi.fn>
  let termTarget: HTMLElement

  /**
   * Build the modal.
   *
   * `arrange` runs after the fakes are built but before the component is
   * created, which is the only window for the socket responses the modal starts
   * requesting immediately.
   * @param data - the manage-plugin modal data
   * @param arrange - registers responses on the freshly built fakes
   */
  async function open(data: Record<string, any>, arrange?: () => void): Promise<ManagePluginComponent> {
    TestBed.resetTestingModule()
    api = fakeApi()
    // Opening the modal always fetches the release notes, whatever the test is
    // about. Without a default the unmatched route resolves `undefined`,
    // getVersionNotes() throws on it and logs "Error loading release notes" —
    // 38 stderr blocks across a green run, which is how a real failure gets
    // missed. Routes match last-registered-first, so a test that cares about
    // the changelog still overrides this with its own respond().
    api.respond('get', /\/plugins\/release\//, {})
    settings = makeSettings()
    toastr = toastrStub()
    activeModal = activeModalStub()
    modal = modalServiceSpy()
    ws = fakeWs()
    io = ws.namespace('plugins')
    pluginsCache = cacheStub<any[]>([makePlugin()])
    childBridges = { getAll: vi.fn(async () => []), invalidate: vi.fn() }
    backup = { downloadBackup: vi.fn(async () => undefined) }

    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideTestTranslate(),
        provideFakes({ api, settings, toastr, activeModal, modal, ws }),
        { provide: PluginsCacheService, useValue: pluginsCache },
        { provide: ChildBridgesService, useValue: childBridges },
        { provide: BackupService, useValue: backup },
        {
          provide: MANAGE_PLUGIN_MODAL_DATA,
          useValue: { pluginName: 'homebridge-test', onRefreshPluginList, ...data },
        },
      ],
    })

    navigate = vi.fn(async () => true)
    vi.spyOn(TestBed.inject(Router), 'navigate').mockImplementation(navigate as any)

    arrange?.()

    const fixture = TestBed.createComponent(ManagePluginComponent)
    fixture.detectChanges()
    await fixture.whenStable()

    // The socket callbacks are async, so the view being rendered is not the end
    // of the story
    for (let tick = 0; tick < 10; tick += 1) {
      await Promise.resolve()
    }

    return fixture.componentInstance
  }

  beforeEach(() => {
    terminals.length = 0
    vi.mocked(saveAs).mockClear()
    onRefreshPluginList = vi.fn()

    // ⚠️ Take the last one away first. The component finds this element by id, and
    // `getElementById` answers with the FIRST match — so leaving each test's div
    // behind means every later test patches the one built for the first test, and
    // anything arranged in the current one is quietly ignored
    document.getElementById('plugin-log-output')?.remove()
    termTarget = document.createElement('div')
    termTarget.id = 'plugin-log-output'
    document.body.appendChild(termTarget)

    // The support message is shown on a coin flip; make it deterministic. 0.9
    // never qualifies, so a test that does not care sees the plain GitHub message
    vi.spyOn(Math, 'random').mockReturnValue(0.9)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.mocked(Math.random).mockRestore?.()
  })

  afterAll(() => {
    termTarget.remove()
  })

  describe('naming the version it is about to install', () => {
    it('resolves the latest tag to the version behind it', async () => {
      const modalRef = await open({ action: 'Update', targetVersion: 'latest', latestVersion: '2.1.0' })

      expect(modalRef.targetVersionPretty()).toBe('v2.1.0')
    })

    it('prefixes an explicit version number', async () => {
      const modalRef = await open({ action: 'Update', targetVersion: '1.9.3' })

      expect(modalRef.targetVersionPretty()).toBe('v1.9.3')
    })

    it('leaves a named tag alone', async () => {
      const modalRef = await open({ action: 'Update', targetVersion: 'beta' })

      // 'vbeta' would be nonsense, so only versions get the prefix
      expect(modalRef.targetVersionPretty()).toBe('beta')
      expect(modalRef.updateToBeta()).toBe(true)
    })
  })

  describe('installing a plugin', () => {
    it('asks the server to install the named version at the terminal size', async () => {
      await open({ action: 'Install', targetVersion: '2.0.0' })

      expect(io.requests[0]).toEqual({
        resource: 'install',
        payload: { name: 'homebridge-test', version: '2.0.0', termCols: 80, termRows: 24 },
      })
    })

    it('clears the caches before telling the plugins page to reload', async () => {
      await open({ action: 'Install', targetVersion: '2.0.0' }, () => {
        io.socket.respondTo('install', {})
      })

      // Both happened, and the invalidations came first: the page's own reload
      // reads these caches, so the other order shows the pre-install list
      expect(childBridges.invalidate).toHaveBeenCalled()
      expect(onRefreshPluginList).toHaveBeenCalled()
      expect(vi.mocked(pluginsCache.invalidate).mock.invocationCallOrder[0])
        .toBeLessThan(vi.mocked(onRefreshPluginList).mock.invocationCallOrder[0])
    })

    it('closes with the freshly installed plugin', async () => {
      await open({ action: 'Install', targetVersion: '2.0.0' }, () => {
        io.socket.respondTo('install', {})
      })

      // The plugins page uses this to open the settings modal straight away, so
      // it needs the whole plugin object rather than just the name
      expect(activeModal.close).toHaveBeenCalledWith({
        action: 'just-installed',
        plugin: expect.objectContaining({ name: 'homebridge-test' }),
      })
    })

    it('still closes when the new plugin cannot be read back', async () => {
      await open({ action: 'Install', targetVersion: '2.0.0' }, () => {
        io.socket.respondTo('install', {})
        pluginsCache.get = vi.fn(async () => Promise.reject(new Error('offline'))) as any
      })

      expect(activeModal.close).toHaveBeenCalledWith({
        action: 'just-installed',
        pluginName: 'homebridge-test',
      })
    })

    it('calls it a reinstall when the version is not changing', async () => {
      const modalRef = await open({ action: 'Install', targetVersion: '1.0.0', installedVersion: '1.0.0' })

      expect(modalRef.pastTenseVerb()).toBe('plugins.manage.reinstalled')
    })

    it('stays open on failure so the log can be read', async () => {
      const modalRef = await open({ action: 'Install', targetVersion: '2.0.0' }, () => {
        io.socket.respondTo('install', { error: 'ETARGET no matching version' })
      })

      expect(modalRef.actionFailed()).toBe(true)
      expect(activeModal.close).not.toHaveBeenCalled()
      expect(toastr.at('error')).toHaveLength(1)
    })

    it('refuses to install homebridge over the network on windows', async () => {
      const modalRef = await open({ action: 'Install', pluginName: 'homebridge', targetVersion: '2.0.0' }, () => {
        settings.env.platform = 'win32'
      })

      // On Windows these two are installed by the installer, not npm, and doing
      // it from here leaves a broken service
      expect(modalRef.onlineUpdateOk()).toBe(false)
      expect(io.requests).toHaveLength(0)
    })

    it('allows an ordinary plugin on windows', async () => {
      const modalRef = await open({ action: 'Install', targetVersion: '2.0.0' }, () => {
        settings.env.platform = 'win32'
      })

      expect(modalRef.onlineUpdateOk()).toBe(true)
      expect(io.requests).toHaveLength(1)
    })
  })

  describe('uninstalling a plugin', () => {
    it('asks the server to uninstall, without a version', async () => {
      await open({ action: 'Uninstall' })

      expect(io.requests[0]).toEqual({
        resource: 'uninstall',
        payload: { name: 'homebridge-test', termCols: 80, termRows: 24 },
      })
    })

    it('sends the user to restart afterwards', async () => {
      await open({ action: 'Uninstall' }, () => {
        io.socket.respondTo('uninstall', {})
      })

      expect(activeModal.close).toHaveBeenCalled()
      expect(navigate).toHaveBeenCalledWith(['/plugins'])
      // A removed plugin's accessories are still live until Homebridge restarts,
      // and this prompt cannot be dismissed with the keyboard by accident
      expect(modal.lastOpened()?.content).toBe(RestartHomebridgeComponent)
      expect(modal.lastOpened()?.options?.keyboard).toBe(false)
    })

    it('stays open on failure', async () => {
      const modalRef = await open({ action: 'Uninstall' }, () => {
        io.socket.respondTo('uninstall', { error: 'EACCES permission denied' })
      })

      expect(modalRef.actionFailed()).toBe(true)
      expect(activeModal.close).not.toHaveBeenCalled()
    })
  })

  describe('updating a plugin', () => {
    it('waits for the user rather than updating on open', async () => {
      await open({ action: 'Update', targetVersion: 'latest' })

      // Unlike install and uninstall, the update screen shows the release notes
      // first and only starts when the button is pressed
      expect(io.requests).toHaveLength(0)
    })

    it('closes quietly when nothing needs restarting', async () => {
      const modalRef = await open({ action: 'Update', targetVersion: 'latest', isConfigured: false }, () => {
        io.socket.respondTo('update', {})
      })

      modalRef.update()
      await Promise.resolve()
      await Promise.resolve()

      // An unconfigured plugin with no child bridges is not running, so there is
      // nothing to restart and no reason to make the user press anything
      expect(activeModal.close).toHaveBeenCalled()
      expect(modalRef.justUpdatedPlugin()).toBe(false)
      expect(toastr.at('success')).toHaveLength(1)
    })

    it('offers a restart when the plugin is configured', async () => {
      const modalRef = await open({ action: 'Update', targetVersion: 'latest', isConfigured: true }, () => {
        io.socket.respondTo('update', {})
      })

      modalRef.update()
      for (let tick = 0; tick < 10; tick += 1) {
        await Promise.resolve()
      }

      expect(modalRef.actionComplete()).toBe(true)
      expect(modalRef.justUpdatedPlugin()).toBe(true)
      expect(activeModal.close).not.toHaveBeenCalled()
    })

    it('offers a restart when the plugin has child bridges, even unconfigured', async () => {
      const modalRef = await open({ action: 'Update', targetVersion: 'latest', isConfigured: false }, () => {
        io.socket.respondTo('update', {})
        childBridges.getAll = vi.fn(async () => [makeChildBridge({ plugin: 'homebridge-test' })])
      })

      modalRef.update()
      for (let tick = 0; tick < 10; tick += 1) {
        await Promise.resolve()
      }

      expect(modalRef.childBridges()).toHaveLength(1)
      expect(modalRef.justUpdatedPlugin()).toBe(true)
    })

    it('ignores child bridges belonging to other plugins', async () => {
      const modalRef = await open({ action: 'Update', targetVersion: 'latest', isConfigured: false }, () => {
        io.socket.respondTo('update', {})
        childBridges.getAll = vi.fn(async () => [makeChildBridge({ plugin: 'homebridge-other' })])
      })

      modalRef.update()
      for (let tick = 0; tick < 10; tick += 1) {
        await Promise.resolve()
      }

      expect(modalRef.childBridges()).toHaveLength(0)
      expect(activeModal.close).toHaveBeenCalled()
    })

    it('hides the release notes once the update starts', async () => {
      const modalRef = await open({ action: 'Update', targetVersion: 'latest' }, () => {
        io.socket.respondTo('update', {})
      })

      modalRef.update()

      expect(modalRef.releaseNotesShow()).toBe(false)
      expect(modalRef.fullChangelog()).toBe('')
    })

    it('sets the restart flag before replacing the page when updating the ui', async () => {
      const modalRef = await open({ action: 'Update', pluginName: 'homebridge-config-ui-x', targetVersion: 'latest' }, () => {
        io.socket.respondTo('update', {})
      })

      modalRef.update()
      for (let tick = 0; tick < 10; tick += 1) {
        await Promise.resolve()
      }

      // The UI is restarting itself, so hb-service has to be told to do a full
      // service restart rather than the in-process one
      expect(api.callsTo('put', '/platform-tools/hb-service/set-full-service-restart-flag')).toHaveLength(1)
      expect(window.location.href).toBe('restart')
    })

    it('still navigates when the restart flag cannot be set', async () => {
      const modalRef = await open({ action: 'Update', pluginName: 'homebridge-config-ui-x', targetVersion: 'latest' }, () => {
        io.socket.respondTo('update', {})
        api.fail('put', '/platform-tools/hb-service/set-full-service-restart-flag', new Error('offline'))
      })

      modalRef.update()
      for (let tick = 0; tick < 10; tick += 1) {
        await Promise.resolve()
      }

      // The new UI is already installed; stopping here would leave the user on a
      // page served by code that no longer exists
      expect(window.location.href).toBe('restart')
    })

    it('does nothing at all when online updates are blocked', async () => {
      const modalRef = await open({ action: 'Update', pluginName: 'homebridge-config-ui-x', targetVersion: 'latest' }, () => {
        settings.env.platform = 'win32'
      })

      modalRef.update()

      expect(io.requests).toHaveLength(0)
    })

    it('stays open on failure', async () => {
      const modalRef = await open({ action: 'Update', targetVersion: 'latest' }, () => {
        io.socket.respondTo('update', { error: 'network timeout' })
      })

      modalRef.update()
      await Promise.resolve()

      expect(modalRef.actionFailed()).toBe(true)
      expect(activeModal.close).not.toHaveBeenCalled()
    })
  })

  describe('the release notes', () => {
    it('asks for the changelog of the version being installed', async () => {
      await open({ action: 'Update', targetVersion: '2.0.0' }, () => {
        api.respond('get', '/plugins/release/homebridge-test', { changelog: '## 2.0.0', notes: 'Breaking changes' })
      })

      expect(api.lastCall('get', '/plugins/release/homebridge-test')?.options).toEqual({
        params: { version: '2.0.0' },
      })
    })

    it('shows the highlighted notes when the release has them', async () => {
      const modalRef = await open({ action: 'Update', targetVersion: '2.0.0' }, () => {
        api.respond('get', '/plugins/release/homebridge-test', { changelog: '## 2.0.0', notes: 'Breaking changes' })
      })

      expect(modalRef.versionNotes()).toBe('Breaking changes')
      expect(modalRef.versionNotesShow()).toBe(true)
    })

    it('takes the resolved version from the changelog for a latest update', async () => {
      const modalRef = await open({ action: 'Update', targetVersion: 'latest', latestVersion: '2.0.0' }, () => {
        api.respond('get', '/plugins/release/homebridge-test', { changelog: '## 2.1.0', latestVersion: 'v2.1.0' })
      })

      // npm may have published a newer version since the page loaded
      expect(modalRef.targetVersionPretty()).toBe('v2.1.0')
    })

    it('keeps an explicit version even when the changelog names another', async () => {
      const modalRef = await open({ action: 'Update', targetVersion: '1.9.0' }, () => {
        api.respond('get', '/plugins/release/homebridge-test', { changelog: '## 2.1.0', latestVersion: 'v2.1.0' })
      })

      expect(modalRef.targetVersionPretty()).toBe('v1.9.0')
    })

    it('hides the empty notes panel for a prerelease', async () => {
      const modalRef = await open({ action: 'Update', targetVersion: 'beta' }, () => {
        api.respond('get', '/plugins/release/homebridge-test', { changelog: '## 2.1.0-beta.1' })
      })

      // Betas rarely have written notes, and an empty panel on every beta is
      // just noise
      expect(modalRef.versionNotesShow()).toBe(false)
    })

    it('treats a version with a prerelease suffix as a prerelease too', async () => {
      const modalRef = await open({ action: 'Update', targetVersion: '2.1.0-beta.1' }, () => {
        api.respond('get', '/plugins/release/homebridge-test', { changelog: '## 2.1.0-beta.1' })
      })

      expect(modalRef.versionNotesShow()).toBe(false)
    })

    it('finishes loading even when the changelog cannot be fetched', async () => {
      const modalRef = await open({ action: 'Update', targetVersion: 'latest' }, () => {
        api.fail('get', '/plugins/release/homebridge-test', new Error('github rate limit'))
      })

      // A missing changelog must not leave a spinner over the update button
      expect(modalRef.fullChangelogLoaded()).toBe(true)
      expect(modalRef.versionNotesLoaded()).toBe(true)
    })
  })

  describe('updating homebridge itself', () => {
    it('warns about the v2 jump before updating', async () => {
      const modalRef = await open({
        action: 'Update',
        pluginName: 'homebridge',
        targetVersion: '2.0.0',
        installedVersion: '1.8.5',
      })

      modalRef.update()
      await Promise.resolve()

      // Going to v2 can break every installed plugin, so the readiness list
      // comes first
      expect(modal.lastOpened()?.content).toBe(HbV2ModalComponent)
      expect(modal.dataFor(HB_V2_MODAL_DATA)).toEqual({ isUpdating: true, skipIfCompatible: false })
    })

    it('skips the warning when already on v2', async () => {
      const modalRef = await open({
        action: 'Update',
        pluginName: 'homebridge',
        targetVersion: '2.1.0',
        installedVersion: '2.0.0',
      }, () => {
        io.socket.respondTo('homebridge-update', {})
      })

      modalRef.update()
      await Promise.resolve()

      expect(modal.opened).toHaveLength(0)
      expect(io.requests[0]?.resource).toBe('homebridge-update')
    })

    it('skips the warning for a patch update within v1', async () => {
      const modalRef = await open({
        action: 'Update',
        pluginName: 'homebridge',
        targetVersion: '1.8.6',
        installedVersion: '1.8.5',
      }, () => {
        io.socket.respondTo('homebridge-update', {})
      })

      modalRef.update()
      await Promise.resolve()

      expect(modal.opened).toHaveLength(0)
    })

    it('goes ahead when the warning is accepted', async () => {
      const modalRef = await open({
        action: 'Update',
        pluginName: 'homebridge',
        targetVersion: '2.0.0',
        installedVersion: '1.8.5',
      }, () => {
        io.socket.respondTo('homebridge-update', {})
      })

      const done = modalRef.update()
      modal.lastOpened()!.ref.close('update')
      void done
      for (let tick = 0; tick < 10; tick += 1) {
        await Promise.resolve()
      }

      expect(io.requests[0]).toEqual({
        resource: 'homebridge-update',
        payload: { version: '2.0.0', termCols: 80, termRows: 24 },
      })
      expect(navigate).toHaveBeenCalledWith(['/restart'])
    })

    it('abandons the update when the warning is declined', async () => {
      const modalRef = await open({
        action: 'Update',
        pluginName: 'homebridge',
        targetVersion: '2.0.0',
        installedVersion: '1.8.5',
      })

      modalRef.update()
      modal.lastOpened()!.ref.close('cancel')
      for (let tick = 0; tick < 10; tick += 1) {
        await Promise.resolve()
      }

      expect(io.requests).toHaveLength(0)
      expect(activeModal.close).toHaveBeenCalled()
    })

    it('closes on failure rather than offering a broken restart', async () => {
      const modalRef = await open({
        action: 'Update',
        pluginName: 'homebridge',
        targetVersion: '1.8.6',
        installedVersion: '1.8.5',
      }, () => {
        io.socket.respondTo('homebridge-update', { error: 'npm failed' })
      })

      modalRef.update()
      for (let tick = 0; tick < 10; tick += 1) {
        await Promise.resolve()
      }

      expect(modalRef.actionFailed()).toBe(true)
      expect(activeModal.close).toHaveBeenCalled()
      expect(navigate).not.toHaveBeenCalledWith(['/restart'])
    })
  })

  describe('the support message', () => {
    it('shows the github message by default', async () => {
      const modalRef = await open({ action: 'Update', targetVersion: 'latest' })

      expect(modalRef.supportMessageKey()).toBe('plugins.manage.support_github')
      expect(modalRef.donationLink()).toBe('')
    })

    it('never asks for donations for homebridge or the ui', async () => {
      vi.mocked(Math.random).mockReturnValue(0.1)
      const modalRef = await open({
        action: 'Update',
        pluginName: 'homebridge-config-ui-x',
        targetVersion: 'latest',
        verifiedPlugin: true,
        funding: [{ type: 'github', url: 'https://github.com/sponsors/someone' }],
      })

      // These are the project's own packages; asking users to donate to them
      // from inside the app would be in poor taste
      expect(modalRef.supportMessageKey()).toBe('plugins.manage.support_github')
    })

    it('asks for a donation for a verified plugin that has funding', async () => {
      vi.mocked(Math.random).mockReturnValue(0.1)
      const modalRef = await open({
        action: 'Update',
        targetVersion: 'latest',
        verifiedPlugin: true,
        funding: [{ type: 'github', url: 'https://github.com/sponsors/someone' }],
      })

      expect(modalRef.supportMessageKey()).toBe('plugins.manage.support_donate')
      expect(modalRef.donationLink()).toContain('https://github.com/sponsors/someone')
    })

    it('names ko-fi when that is where the funding points', async () => {
      vi.mocked(Math.random).mockReturnValue(0.1)
      const modalRef = await open({
        action: 'Update',
        targetVersion: 'latest',
        verifiedPlusPlugin: true,
        funding: 'https://ko-fi.com/someone',
      })

      // Worth its own wording: ko-fi is a one-off coffee rather than a
      // recurring sponsorship
      expect(modalRef.supportMessageKey()).toBe('plugins.manage.support_kofi')
    })

    it('reads funding given as a bare object with a url', async () => {
      // ⚠️ package.json allows a string, an array or a single object here, and a
      // shape that falls through leaves the plugin author's funding link unused
      vi.mocked(Math.random).mockReturnValue(0.1)
      const modalRef = await open({
        action: 'Update',
        targetVersion: 'latest',
        verifiedPlugin: true,
        funding: { type: 'github', url: 'https://github.com/sponsors/someone-else' },
      })

      expect(modalRef.donationLink()).toContain('https://github.com/sponsors/someone-else')
    })

    it('picks one of several funding links', async () => {
      vi.mocked(Math.random).mockReturnValue(0.1)
      const modalRef = await open({
        action: 'Update',
        targetVersion: 'latest',
        verifiedPlugin: true,
        funding: ['https://ko-fi.com/someone', 'https://github.com/sponsors/someone'],
      })

      expect(modalRef.donationLink()).toContain('https://ko-fi.com/someone')
    })

    it('falls back to github when the funding entries have no url', async () => {
      vi.mocked(Math.random).mockReturnValue(0.1)
      const modalRef = await open({
        action: 'Update',
        targetVersion: 'latest',
        verifiedPlugin: true,
        funding: [{ type: 'patreon' }],
      })

      expect(modalRef.supportMessageKey()).toBe('plugins.manage.support_github')
      expect(modalRef.donationLink()).toBe('')
    })

    it.each(['homebridge', 'homebridge-config-ui-x'])('never asks for a donation for %s', async (pluginName) => {
      // ⚠️ These two are the project itself, and a donation prompt on them would
      // be asking the user to fund whoever last touched the funding field
      vi.mocked(Math.random).mockReturnValue(0.1)
      const modalRef = await open({
        pluginName,
        action: 'Update',
        targetVersion: 'latest',
        verifiedPlugin: true,
        funding: 'https://ko-fi.com/someone',
      })

      expect(modalRef.supportMessageKey()).toBe('plugins.manage.support_github')
      expect(modalRef.donationLink()).toBe('')
    })

    it('ignores funding on an unverified plugin', async () => {
      vi.mocked(Math.random).mockReturnValue(0.1)
      const modalRef = await open({
        action: 'Update',
        targetVersion: 'latest',
        funding: [{ url: 'https://ko-fi.com/someone' }],
      })

      expect(modalRef.supportMessageKey()).toBe('plugins.manage.support_github')
    })
  })

  describe('the terminal output', () => {
    it('writes the server output straight to the terminal', async () => {
      await open({ action: 'Update', targetVersion: 'latest' })

      io.socket.fire('stdout', 'added 1 package\r\n')

      expect(terminals[0].written).toEqual(['added 1 package\r\n'])
    })

    it('saves the log without the colour codes', async () => {
      const modalRef = await open({ action: 'Update', targetVersion: 'latest' })
      io.socket.fire('stdout', '\u001B[31mnpm ERR! code E404\u001B[39m\r\n')

      modalRef.downloadLogFile()

      const written = await (vi.mocked(saveAs).mock.calls[0][0] as Blob).text()
      // This file gets pasted into GitHub issues, where escape codes are noise
      expect(written).toBe('npm ERR! code E404\r\n')
      expect(vi.mocked(saveAs).mock.calls[0][1]).toBe('homebridge-test-error.log')
    })

    it('keeps blank output out of the log', async () => {
      const modalRef = await open({ action: 'Update', targetVersion: 'latest' })
      io.socket.fire('stdout', '\u001B[2K')

      modalRef.downloadLogFile()

      // Progress bars send a lot of cursor control and nothing else
      expect(await (vi.mocked(saveAs).mock.calls[0][0] as Blob).text()).toBe('')
    })

    it('closes the socket on teardown', async () => {
      await open({ action: 'Update', targetVersion: 'latest' })

      TestBed.resetTestingModule()

      expect(io.end).toHaveBeenCalled()
    })
  })

  describe('what happens after a successful update', () => {
    it('sends the user to the restart page', async () => {
      const modalRef = await open({ action: 'Update', targetVersion: 'latest' })

      modalRef.onRestartHomebridgeClick()

      expect(navigate).toHaveBeenCalledWith(['/restart'])
      expect(activeModal.close).toHaveBeenCalled()
    })

    it('restarts each child bridge and shows its log', async () => {
      const modalRef = await open({ action: 'Update', targetVersion: 'latest' })
      modalRef.childBridges.set([
        makeChildBridge({ username: '0E:11:11:11:11:11' }),
        makeChildBridge({ username: '0E:22:22:22:22:22' }),
      ])

      await modalRef.onRestartChildBridgeClick()

      expect(api.callsTo('put').map(call => call.url)).toEqual([
        '/server/restart/0E:11:11:11:11:11',
        '/server/restart/0E:22:22:22:22:22',
      ])
      // The log is opened so the user can watch the bridge come back up
      expect(modal.lastOpened()?.content).toBe(PluginLogsComponent)
    })

    it('closes even when a child bridge will not restart', async () => {
      const modalRef = await open({ action: 'Update', targetVersion: 'latest' }, () => {
        api.fail('put', /\/server\/restart\//, new Error('not running'))
      })
      modalRef.childBridges.set([makeChildBridge()])

      await modalRef.onRestartChildBridgeClick()

      expect(toastr.at('error')[0].message).toBe('plugins.manage.child_bridge_restart_failed')
      expect(activeModal.close).toHaveBeenCalled()
    })

    it('offers a backup download and re-enables the button afterwards', async () => {
      const modalRef = await open({ action: 'Update', targetVersion: 'latest' })

      await modalRef.downloadBackupFile()

      expect(backup.downloadBackup).toHaveBeenCalled()
      expect(modalRef.downloadingBackup()).toBe(false)
    })

    it('re-enables the backup button when the download fails', async () => {
      const modalRef = await open({ action: 'Update', targetVersion: 'latest' }, () => {
        backup.downloadBackup = vi.fn(async () => Promise.reject(new Error('too big')))
      })

      await modalRef.downloadBackupFile()

      expect(modalRef.downloadingBackup()).toBe(false)
      expect(toastr.at('error')).toHaveLength(1)
    })
  })

  describe('going back to the version picker', () => {
    it('reopens the version modal', async () => {
      const modalRef = await open({
        action: 'Install',
        targetVersion: '2.0.0',
        backToVersionModal: makePlugin(),
      })

      void modalRef.goBack()

      expect(activeModal.dismiss).toHaveBeenCalledWith('Back')
      expect(modal.lastOpened()?.content).toBe(ManageVersionComponent)
      expect(modal.dataFor(MANAGE_VERSION_MODAL_DATA)?.plugin).toMatchObject({ name: 'homebridge-test' })
    })

    it('reopens itself as an update when an alternate version is chosen', async () => {
      const modalRef = await open({
        action: 'Install',
        targetVersion: '2.0.0',
        installedVersion: '1.0.0',
        backToVersionModal: makePlugin(),
      })

      const done = modalRef.goBack()
      modal.lastOpened()!.ref.close({ action: 'alternate', version: '1.5.0' })
      await done

      // 'alternate' means a version is already installed, so the second pass has
      // to run npm's update rather than a fresh install
      expect(modal.lastOpened()?.content).toBe(ManagePluginComponent)
      expect(modal.dataFor(MANAGE_PLUGIN_MODAL_DATA)).toMatchObject({
        action: 'Update',
        targetVersion: '1.5.0',
      })
    })

    it('reopens itself as an install for a first install', async () => {
      const modalRef = await open({
        action: 'Install',
        targetVersion: '2.0.0',
        backToVersionModal: makePlugin(),
      })

      const done = modalRef.goBack()
      modal.lastOpened()!.ref.close({ action: 'install', version: '2.0.0' })
      await done

      expect(modal.dataFor(MANAGE_PLUGIN_MODAL_DATA)).toMatchObject({ action: 'Install' })
    })

    it('does nothing when the version picker is dismissed', async () => {
      const modalRef = await open({
        action: 'Install',
        targetVersion: '2.0.0',
        backToVersionModal: makePlugin(),
      })

      const done = modalRef.goBack()
      modal.lastOpened()!.ref.dismiss('Dismiss')
      await done

      // Only the version modal was opened; this one is already dismissed
      expect(modal.opened).toHaveLength(1)
    })
  })

  /**
   * What a screen reader hears while a plugin installs.
   *
   * ⚠️ **xterm assumes it is an interactive terminal.** This one only shows install
   * output, so its textarea is a focusable input that does nothing, and its live
   * region announces every line of npm output character by character. The page
   * announces progress itself, so xterm's own announcements are noise on top.
   */
  describe('the install log for a screen reader', () => {
    /**
     * Put xterm's own subtree inside the log element.
     *
     * The real one is not needed: what the page does is find `.xterm` and rewrite
     * the two nodes inside it.
     */
    function withXtermSubtree() {
      const root = document.createElement('div')
      root.className = 'xterm'
      const textarea = document.createElement('textarea')
      const live = document.createElement('div')
      live.setAttribute('aria-live', 'assertive')
      live.setAttribute('aria-atomic', 'true')
      root.append(textarea, live)
      termTarget.append(root)
      return { textarea, live }
    }

    /** Let the deferred patch passes run. */
    async function settlePatches() {
      await vi.advanceTimersByTimeAsync(300)
    }

    it('takes the unusable input out of the tab order', async () => {
      vi.useFakeTimers()
      const { textarea } = withXtermSubtree()

      await open({ action: 'Install' })
      await settlePatches()

      expect(textarea.disabled).toBe(true)
      expect(textarea.getAttribute('aria-hidden')).toBe('true')
      expect(textarea.getAttribute('tabindex')).toBe('-1')
      expect(textarea.getAttribute('readonly')).toBe('true')
    })

    it('silences xterm own line-by-line announcements', async () => {
      // ⚠️ The page announces progress in whole sentences instead. Both at once is
      // unusable
      vi.useFakeTimers()
      const { live } = withXtermSubtree()

      await open({ action: 'Install' })
      await settlePatches()

      expect(live.getAttribute('aria-live')).toBe('off')
      expect(live.getAttribute('aria-atomic')).toBe('false')
    })

    it('moves focus out of the input if it had already landed there', async () => {
      vi.useFakeTimers()
      const { textarea } = withXtermSubtree()
      textarea.focus()

      await open({ action: 'Install' })
      await settlePatches()

      expect(document.activeElement).not.toBe(textarea)
    })

    it('copes with xterm not having rendered yet', async () => {
      // The patches run on a repeating timer precisely because they can be early
      vi.useFakeTimers()

      await open({ action: 'Install' })

      await expect(settlePatches()).resolves.not.toThrow()
    })
  })
})

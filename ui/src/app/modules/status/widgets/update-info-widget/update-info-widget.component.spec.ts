import type { FakeIoNamespace, FakeModalService, FakeSettings, FakeToastr, FakeWs } from '@/testing'

import { NO_ERRORS_SCHEMA, signal } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { provideRouter } from '@angular/router'
import { TranslatePipe } from '@ngx-translate/core'
import { Subject } from 'rxjs'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { InformationComponent } from '@/app/core/components/information/information.component'
import { HB_V2_MODAL_DATA, INFORMATION_MODAL_DATA, NODE_VERSION_MODAL_DATA } from '@/app/core/modal-data-tokens'
import { ManagePluginsService } from '@/app/core/plugins/manage-plugins.service'
import { UpdateAllModalComponent } from '@/app/core/update-all/update-all-modal.component'
import { HbV2ModalComponent } from '@/app/modules/status/widgets/update-info-widget/hb-v2-modal/hb-v2-modal.component'
import { NodeVersionModalComponent } from '@/app/modules/status/widgets/update-info-widget/node-version-modal/node-version-modal.component'
import { UpdateInfoWidgetComponent } from '@/app/modules/status/widgets/update-info-widget/update-info-widget.component'
import { environment } from '@/environments/environment'
import { fakeWs, makeAuth, makeSettings, modalServiceSpy, toastrStub } from '@/testing'
import { provideFakes, provideTestTranslate } from '@/testing/providers'

const SPINNER = 'fa-circle-notch fa-spin primary-text'
const WARNING = 'fa-exclamation-circle orange-text'
const UPDATE = 'fa-arrow-alt-circle-up orange-text'
const UP_TO_DATE = 'fa-check-circle green-text'
const POLICY_OFF = 'fa-circle green-text'

/**
 * The four icon functions are pure functions of widget state, so they are
 * called off the prototype with a hand-built context. Booting the widget would
 * mean a socket, the plugin service and the settings service, none of which
 * change the answer.
 * @param method - the icon function to call
 * @param state - the widget fields it reads
 */
function iconClass(method: string, state: Record<string, any>): string {
  return (UpdateInfoWidgetComponent.prototype as any)[method].call(state)
}

describe('UpdateInfoWidgetComponent', () => {
  describe('getHomebridgeIconClass', () => {
    const homebridge = (pkg: Record<string, any>, homebridgeUpdatePolicy = 'all') =>
      iconClass('getHomebridgeIconClass', { homebridgePkg: signal(pkg), homebridgeUpdatePolicy })

    it('spins until the installed version is known', () => {
      expect(homebridge({})).toBe(SPINNER)
    })

    it('warns about multiple instances before anything else', () => {
      expect(homebridge({ installedVersion: '2.0.0', multipleInstances: true, updateAvailable: true })).toBe(WARNING)
    })

    it.each([
      ['all', true, UPDATE],
      ['all', false, UP_TO_DATE],
      ['beta', true, UPDATE],
      ['none', true, POLICY_OFF],
      ['none', false, POLICY_OFF],
      ['major', false, POLICY_OFF],
      ['major', true, UPDATE],
    ])('shows policy %s with update=%s as %s', (policy, updateAvailable, expected) => {
      expect(homebridge({ installedVersion: '2.0.0', updateAvailable }, policy)).toBe(expected)
    })
  })

  describe('getHomebridgeUiIconClass', () => {
    const ui = (pkg: Record<string, any>, homebridgeUiUpdatePolicy = 'all') =>
      iconClass('getHomebridgeUiIconClass', { homebridgeUiPkg: signal(pkg), homebridgeUiUpdatePolicy })

    it('spins until the installed version is known', () => {
      expect(ui({})).toBe(SPINNER)
    })

    it('has no multiple-instances warning, unlike homebridge itself', () => {
      expect(ui({ installedVersion: '5.0.0', multipleInstances: true, updateAvailable: false })).toBe(UP_TO_DATE)
    })

    it.each([
      ['all', true, UPDATE],
      ['all', false, UP_TO_DATE],
      ['none', true, POLICY_OFF],
      ['major', false, POLICY_OFF],
      ['major', true, UPDATE],
    ])('shows policy %s with update=%s as %s', (policy, updateAvailable, expected) => {
      expect(ui({ installedVersion: '5.0.0', updateAvailable }, policy)).toBe(expected)
    })
  })

  describe('getPluginsIconClass', () => {
    it('spins until the plugin check has finished', () => {
      expect(iconClass('getPluginsIconClass', {
        homebridgePluginStatusDone: signal(false),
        homebridgePluginStatus: signal([]),
      })).toBe(SPINNER)
    })

    it('offers an update when any plugin has one, and is not policy-gated', () => {
      const done = (plugins: unknown[]) => iconClass('getPluginsIconClass', {
        homebridgePluginStatusDone: signal(true),
        homebridgePluginStatus: signal(plugins),
      })

      expect(done([{ name: 'homebridge-test' }])).toBe(UPDATE)
      expect(done([])).toBe(UP_TO_DATE)
    })
  })

  describe('getNodejsIconClass', () => {
    const node = (info: Record<string, any> | null, nodeUpdatePolicy = 'all', done = true) =>
      iconClass('getNodejsIconClass', { nodejsInfo: signal(info), nodejsStatusDone: signal(done), nodeUpdatePolicy })

    it('spins until the node check has finished', () => {
      expect(node(null, 'all', false)).toBe(SPINNER)
    })

    it('lets the policy win over an unsupported-version warning', () => {
      // The policy check runs first, so a user who turned node updates off
      // never sees the warning icon
      expect(node({ showNodeUnsupportedWarning: true, updateAvailable: false }, 'none')).toBe(POLICY_OFF)
      expect(node({ showNodeUnsupportedWarning: true, updateAvailable: false }, 'all')).toBe(WARNING)
    })

    it.each([
      ['all', true, UPDATE],
      ['all', false, UP_TO_DATE],
      ['none', true, POLICY_OFF],
      ['major', false, POLICY_OFF],
      ['major', true, UPDATE],
    ])('shows policy %s with update=%s as %s', (policy, updateAvailable, expected) => {
      expect(node({ updateAvailable, showNodeUnsupportedWarning: false }, policy)).toBe(expected)
    })

    it('treats a missing node reading as up to date', () => {
      expect(node(null)).toBe(UP_TO_DATE)
    })
  })

  /**
   * The rest of the widget, which is about one aggregated payload.
   *
   * ⚠️ **A null field in the payload means that upstream call failed on the
   * server**, and the tile it belongs to has to stay in its loading state rather
   * than claim everything is up to date. Filling in a default there would tell the
   * user their box is fine when nothing was actually checked.
   */
  describe('the version overview it loads', () => {
    let settings: FakeSettings
    let toastr: FakeToastr
    let modal: FakeModalService
    let ws: FakeWs
    let io: FakeIoNamespace
    let managePlugins: { installAlternateVersion: ReturnType<typeof vi.fn>, upgradeHomebridge: ReturnType<typeof vi.fn> }
    let saveWidgets: Subject<void>

    /** The aggregated payload, with everything present by default. */
    function overview(overrides: Record<string, any> = {}) {
      return {
        serverInfo: { nodeVersion: '22.0.0', homebridgeRunningInDocker: false, homebridgeRunningInSynologyPackage: false },
        node: { updateAvailable: false, showNodeUnsupportedWarning: false, architecture: 'arm64', supportsNodeJs24: true },
        homebridge: { name: 'homebridge', installedVersion: '1.8.0', latestVersion: '1.8.0', updateAvailable: false },
        homebridgeUi: { name: 'homebridge-config-ui-x', installedVersion: '5.0.0', updateAvailable: true },
        outOfDatePlugins: [],
        docker: { latestVersion: null, latestReleaseBody: '', updateAvailable: false },
        hbV2Ready: true,
        ...overrides,
      }
    }

    /**
     * Build the widget with a payload waiting for it.
     * @param options - how to set it up
     * @param options.payload - the version overview the server returns
     * @param options.env - settings env overrides
     * @param options.admin - whether the signed-in user is an admin
     * @param options.fails - make the overview request fail
     */
    function create(options: { payload?: Record<string, any>, env?: Record<string, any>, admin?: boolean, fails?: boolean } = {}) {
      TestBed.resetTestingModule()
      toastr = toastrStub()
      modal = modalServiceSpy()
      ws = fakeWs()
      saveWidgets = new Subject<void>()
      settings = makeSettings({ env: { packageVersion: '5.0.0', homebridgeVersion: '1.8.0', ...options.env } })
      managePlugins = { installAlternateVersion: vi.fn(), upgradeHomebridge: vi.fn() }

      io = ws.namespace('status')
      if (options.fails) {
        io.socket.respondTo('get-version-overview', () => {
          throw new Error('socket error')
        })
      } else {
        io.socket.respondTo('get-version-overview', overview(options.payload))
      }

      TestBed.configureTestingModule({
        imports: [UpdateInfoWidgetComponent],
        providers: [
          provideRouter([]),
          provideTestTranslate(),
          provideFakes({
            settings,
            toastr,
            modal,
            ws,
            auth: makeAuth({ user: { username: 'admin', admin: options.admin ?? true } }),
          }),
          { provide: ManagePluginsService, useValue: managePlugins },
        ],
      })

      TestBed.overrideComponent(UpdateInfoWidgetComponent, {
        set: { imports: [TranslatePipe], schemas: [NO_ERRORS_SCHEMA] },
      })

      const fixture = TestBed.createComponent(UpdateInfoWidgetComponent)
      fixture.componentRef.setInput('widget', { dockerExpanded: false, $saveWidgetsEvent: saveWidgets })
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

    it('takes the homebridge version from the payload', async () => {
      const widget = create({ payload: { homebridge: { installedVersion: '1.9.0', updateAvailable: true } } })
      await settle()

      expect(widget.homebridgePkg().installedVersion).toBe('1.9.0')
      expect(widget.homebridgeVersion).toBe('1.9.0')
    })

    it('tells the rest of the app which homebridge is running', async () => {
      // Several other pages read this rather than asking again
      create({ payload: { homebridge: { installedVersion: '1.9.0' } } })
      await settle()

      expect(settings.env.homebridgeVersion).toBe('1.9.0')
    })

    it('names it Homebridge, whatever the package is called', async () => {
      const widget = create()
      await settle()

      expect(widget.homebridgePkg().displayName).toBe('Homebridge')
    })

    it.each([
      ['2.0.0', true],
      ['2.0.0-beta.7', true],
      ['10.1.0', true],
      ['1.8.0', false],
      ['1.10.0', false],
    ])('reads %s as running v2: %s', async (installedVersion, expected) => {
      // ⚠️ By major version, not by a string prefix: '1.10.0' starts with '1.1'
      // and a prefix test on '2' would also match '20.x' one day
      const widget = create({ payload: { homebridge: { installedVersion } } })
      await settle()

      expect(widget.isRunningHbV2()).toBe(expected)
    })

    it('shows the plugins that are out of date', async () => {
      const widget = create({ payload: { outOfDatePlugins: [{ name: 'homebridge-example' }] } })
      await settle()

      expect(widget.homebridgePluginStatus().map(p => p.name)).toEqual(['homebridge-example'])
      expect(widget.homebridgePluginStatusDone()).toBe(true)
    })

    it('never counts the ui among them', async () => {
      // It has its own row in the widget
      const widget = create({ payload: { outOfDatePlugins: [{ name: 'homebridge-config-ui-x' }, { name: 'homebridge-example' }] } })
      await settle()

      expect(widget.homebridgePluginStatus().map(p => p.name)).toEqual(['homebridge-example'])
    })

    it('leaves out a plugin the user muted', async () => {
      const widget = create({
        payload: { outOfDatePlugins: [{ name: 'homebridge-example' }] },
        env: { plugins: { hideUpdatesFor: ['homebridge-example'] } },
      })
      await settle()

      expect(widget.homebridgePluginStatus()).toEqual([])
    })

    it('keeps the node tile loading when the server could not check', async () => {
      // ⚠️ Not "up to date": nothing was checked
      const widget = create({ payload: { node: null } })
      await settle()

      expect(widget.nodejsStatusDone()).toBe(false)
      expect(widget.nodejsInfo()).toBeNull()
    })

    it('keeps the homebridge tile empty when the server could not check', async () => {
      const widget = create({ payload: { homebridge: null } })
      await settle()

      expect(widget.homebridgePkg().installedVersion).toBeUndefined()
    })

    it('finishes the docker tile when homebridge is not in docker', async () => {
      // There is nothing to check, so it must not spin for ever
      const widget = create({ payload: { serverInfo: { homebridgeRunningInDocker: false }, docker: null } })
      await settle()

      expect(widget.dockerStatusDone()).toBe(true)
    })

    it('shows the docker version when it is', async () => {
      const widget = create({
        payload: {
          serverInfo: { homebridgeRunningInDocker: true },
          docker: { latestVersion: '2.0.0', latestReleaseBody: 'notes', updateAvailable: true },
        },
      })
      await settle()

      expect(widget.dockerInfo().latestVersion).toBe('2.0.0')
      expect(widget.dockerStatusDone()).toBe(true)
    })

    it('keeps the docker tile loading when that check failed', async () => {
      const widget = create({ payload: { serverInfo: { homebridgeRunningInDocker: true }, docker: null } })
      await settle()

      expect(widget.dockerStatusDone()).toBe(false)
    })

    it('says nothing went wrong quietly', async () => {
      const widget = create({ fails: true })
      await settle()

      expect(toastr.error).toHaveBeenCalled()
      expect(console.error).toHaveBeenCalled()
      expect(widget.homebridgePluginStatusDone()).toBe(false)
    })

    describe('the v2 readiness button', () => {
      it('shows the answer the server worked out', async () => {
        const widget = create({ payload: { hbV2Ready: false } })
        await settle()

        expect(widget.isHbV2Ready()).toBe(false)
        expect(widget.isHbV2Loaded()).toBe(true)
      })

      it('is not offered to a non-admin', async () => {
        // Only an admin can act on it
        const widget = create({ payload: { hbV2Ready: false }, admin: false })
        await settle()

        expect(widget.isHbV2Loaded()).toBe(false)
        expect(widget.isHbV2Ready()).toBe(true)
      })

      it('is not offered once v2 is already running', async () => {
        const widget = create({ payload: { homebridge: { installedVersion: '2.0.0' }, hbV2Ready: false } })
        await settle()

        expect(widget.isHbV2Loaded()).toBe(false)
        expect(widget.isHbV2Ready()).toBe(true)
      })

      it('opens the readiness modal', async () => {
        const widget = create()
        await settle()

        widget.readyForV2Modal()

        expect(modal.lastOpened()!.content).toBe(HbV2ModalComponent)
        expect(modal.dataFor(HB_V2_MODAL_DATA)).toMatchObject({ isUpdating: false, skipIfCompatible: false })
      })
    })

    describe('the node version modal', () => {
      it('hands it everything it needs to decide what to offer', async () => {
        const widget = create()
        await settle()

        widget.nodeVersionModal('24.0.0')

        expect(modal.lastOpened()!.content).toBe(NodeVersionModalComponent)
        expect(modal.dataFor(NODE_VERSION_MODAL_DATA)).toMatchObject({
          nodeVersion: '22.0.0',
          latestVersion: '24.0.0',
          architecture: 'arm64',
          supportsNodeJs24: true,
        })
      })

      it('passes on where homebridge is running', async () => {
        // A synology package or a docker container cannot update node the usual way
        const widget = create({
          payload: {
            serverInfo: { nodeVersion: '22.0.0', homebridgeRunningInDocker: true, homebridgeRunningInSynologyPackage: true },
          },
        })
        await settle()

        widget.nodeVersionModal('24.0.0')

        expect(modal.dataFor(NODE_VERSION_MODAL_DATA)).toMatchObject({
          homebridgeRunningInDocker: true,
          homebridgeRunningInSynologyPackage: true,
        })
      })

      it('gives it the socket, so it can clear the version cache itself', async () => {
        const widget = create()
        await settle()

        widget.nodeVersionModal('24.0.0')

        expect(modal.dataFor(NODE_VERSION_MODAL_DATA)?.statusIo).toBe(io)
      })

      it('re-reads the node version after an update', async () => {
        // The widget would otherwise go on showing the old version
        const widget = create()
        await settle()
        widget.nodeVersionModal('24.0.0')
        io.socket.respondTo('nodejs-version-check', { updateAvailable: false, showNodeUnsupportedWarning: false })
        io.socket.respondTo('get-homebridge-server-info', { nodeVersion: '24.0.0' })

        await modal.dataFor(NODE_VERSION_MODAL_DATA)!.onUpdate!()

        expect(widget.serverInfo()?.nodeVersion).toBe('24.0.0')
      })
    })

    describe('the docker update panel', () => {
      it('remembers whether the user expanded it', async () => {
        const widget = create()
        await settle()
        const saved = vi.fn()
        saveWidgets.subscribe(saved)

        widget.toggleDockerExpand()

        expect(widget.widget().dockerExpanded).toBe(true)
        expect(saved).toHaveBeenCalled()
      })

      it('folds it away again', async () => {
        const widget = create()
        await settle()

        widget.toggleDockerExpand()
        widget.toggleDockerExpand()

        expect(widget.widget().dockerExpanded).toBe(false)
      })

      it('shows the release notes in the information modal', async () => {
        const widget = create({
          payload: {
            serverInfo: { homebridgeRunningInDocker: true },
            docker: { currentVersion: '1.0.0', latestVersion: '2.0.0', latestReleaseBody: 'what changed', updateAvailable: true },
          },
        })
        await settle()

        widget.dockerUpdateModal()

        expect(modal.lastOpened()!.content).toBe(InformationComponent)
        expect(modal.dataFor(INFORMATION_MODAL_DATA)).toMatchObject({
          markdownMessage2: 'what changed',
          subtitle: '1.0.0 &rarr; 2.0.0',
        })
      })

      it('says the versions are unknown rather than showing an empty arrow', async () => {
        const widget = create({ payload: { serverInfo: { homebridgeRunningInDocker: true }, docker: { latestVersion: null } } })
        await settle()

        widget.dockerUpdateModal()

        expect(modal.dataFor(INFORMATION_MODAL_DATA)?.subtitle).toBe('accessories.control.unknown')
      })
    })

    describe('changing a version by hand', () => {
      it('opens the version picker for the package', async () => {
        const widget = create()
        await settle()
        const pkg = { name: 'homebridge' } as any

        widget.installAlternateVersion(pkg)

        expect(managePlugins.installAlternateVersion).toHaveBeenCalledWith(pkg, expect.any(Function))
      })

      it('re-reads the homebridge version afterwards', async () => {
        // The row would otherwise still show the version that was replaced
        const widget = create()
        await settle()
        widget.installAlternateVersion({ name: 'homebridge' } as any)
        io.socket.respondTo('homebridge-version-check', { installedVersion: '2.0.0', updateAvailable: false })

        await managePlugins.installAlternateVersion.mock.calls[0][1]()

        expect(widget.homebridgePkg().installedVersion).toBe('2.0.0')
        expect(widget.isRunningHbV2()).toBe(true)
      })

      it('re-reads the ui version afterwards', async () => {
        const widget = create()
        await settle()
        widget.installAlternateVersion({ name: 'homebridge-config-ui-x' } as any)
        io.socket.respondTo('homebridge-ui-version-check', { installedVersion: '5.1.0', updateAvailable: true })

        await managePlugins.installAlternateVersion.mock.calls[0][1]()

        expect(widget.homebridgeUiPkg().installedVersion).toBe('5.1.0')
      })

      it('reads nothing again for any other package', async () => {
        const widget = create()
        await settle()
        widget.installAlternateVersion({ name: 'homebridge-example' } as any)
        io.requests.length = 0

        await managePlugins.installAlternateVersion.mock.calls[0][1]()

        expect(io.requests).toEqual([])
      })

      it('says so when the version cannot be re-read', async () => {
        const widget = create()
        await settle()
        widget.installAlternateVersion({ name: 'homebridge' } as any)
        io.socket.respondTo('homebridge-version-check', () => {
          throw new Error('socket error')
        })

        await managePlugins.installAlternateVersion.mock.calls[0][1]()

        expect(toastr.error).toHaveBeenCalled()
      })

      it('sends an update straight to the upgrade flow', async () => {
        const widget = create()
        await settle()
        const pkg = { name: 'homebridge', latestVersion: '1.9.0' } as any

        widget.updatePackage(pkg)

        expect(managePlugins.upgradeHomebridge).toHaveBeenCalledWith(pkg, '1.9.0')
      })
    })

    describe('the update all button', () => {
      /**
       * Everything reporting an update at once.
       *
       * ⚠️ A fresh object each time: the widget writes onto the payload it is
       * given (`hbUi.updateAvailable = false` in a dev build), so a shared one
       * would carry that edit into the next test.
       */
      function allOutOfDate() {
        return {
          homebridge: { name: 'homebridge', installedVersion: '1.8.0', latestVersion: '1.9.0', updateAvailable: true },
          homebridgeUi: { name: 'homebridge-config-ui-x', installedVersion: '5.0.0', updateAvailable: true },
          outOfDatePlugins: [{ name: 'homebridge-example', displayName: 'Example', installedVersion: '1.0.0', latestVersion: '1.1.0' }],
        }
      }

      it('counts homebridge and every out-of-date plugin', async () => {
        // The count gates the button (from two): with a single update the
        // existing one-package flow is the right tool.
        // ⚠️ Two, not three: this is a dev build, and the widget forces the
        // ui's own update off in anything but production - see below
        const widget = create({ payload: allOutOfDate() })
        await settle()

        expect(widget.updateAllCount()).toBe(2)
      })

      it('counts the ui itself only in a real build', async () => {
        // A dev build must never offer to update the ui out from under the
        // developer running it, so `updateAvailable` is cleared on load
        environment.production = true
        try {
          const widget = create({ payload: allOutOfDate() })
          await settle()

          expect(widget.updateAllCount()).toBe(3)
        } finally {
          environment.production = false
        }
      })

      it('counts nothing when everything is up to date', async () => {
        const widget = create({
          payload: {
            homebridge: { name: 'homebridge', installedVersion: '1.8.0', latestVersion: '1.8.0', updateAvailable: false },
            homebridgeUi: { name: 'homebridge-config-ui-x', installedVersion: '5.0.0', updateAvailable: false },
            outOfDatePlugins: [],
          },
        })
        await settle()

        expect(widget.updateAllCount()).toBe(0)
      })

      it('opens the plan modal, which cannot be clicked away', async () => {
        const widget = create()
        await settle()

        widget.updateAllModal()

        expect(modal.lastOpened()!.content).toBe(UpdateAllModalComponent)
        // A run must not be interrupted by a stray backdrop click
        expect(modal.lastOpened()!.options).toMatchObject({ size: 'lg', backdrop: 'static' })
      })
    })
  })
})

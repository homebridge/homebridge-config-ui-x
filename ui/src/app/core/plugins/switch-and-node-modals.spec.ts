import type { FakeApi, FakeCache, FakeIoNamespace, FakeSettings, FakeToastr, FakeWs } from '@/testing'

import { NO_ERRORS_SCHEMA } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { provideRouter, Router } from '@angular/router'
import { TranslatePipe } from '@ngx-translate/core'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { PluginsCacheService } from '@/app/core/caching/plugins-cache.service'
import { NODE_VERSION_MODAL_DATA, SWITCH_TO_SCOPED_MODAL_DATA } from '@/app/core/modal-data-tokens'
import { SAVE_AS } from '@/app/core/utilities/file-saver.factory'
import { TERMINAL_FACTORY } from '@/app/core/utilities/terminal.factory'
import { activeModalStub, cacheStub, fakeApi, fakeIoNamespace, fakeSaveAs, fakeTerminals, fakeWs, makePlugin, makeSettings, toastrStub } from '@/testing'
import { provideFakes, provideTestTranslate } from '@/testing/providers'

/**
 * Two modals that both walk the user through a multi-step operation.
 *
 * ⚠️ Both components are loaded with `await import()` and imported above as types
 * only. A top-level value import evaluates them against the real xterm and
 * `file-saver` before the mock registry is consulted — the mocks then record
 * nothing, which reads as the component being broken.
 */
describe('the switch-to-scoped and node version modals', () => {
  let xterm: ReturnType<typeof fakeTerminals>
  let saveAs: ReturnType<typeof fakeSaveAs>
  let api: FakeApi
  let toastr: FakeToastr
  let settings: FakeSettings
  let activeModal: ReturnType<typeof activeModalStub>
  let navigate: ReturnType<typeof vi.fn>

  async function settle() {
    for (let tick = 0; tick < 12; tick += 1) {
      await Promise.resolve()
    }
  }

  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.mocked(console.error).mockClear()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('switching a plugin to its scoped name', () => {
    let ws: FakeWs
    let io: FakeIoNamespace

    /**
     * Open the modal.
     * @param options - how to set it up
     * @param options.platform - the host platform, which gates the online update
     * @param options.arrange - runs on the fresh fakes before the modal is built
     */
    async function open(options: { platform?: string, arrange?: () => void } = {}) {
      TestBed.resetTestingModule()
      api = fakeApi()
      toastr = toastrStub()
      settings = makeSettings({ env: { platform: (options.platform ?? 'linux') as any } })
      activeModal = activeModalStub()
      ws = fakeWs()
      io = ws.namespace('plugins')
      io.socket.respondTo('install', {})
      io.socket.respondTo('uninstall', {})

      const { SwitchToScopedComponent } = await import('@/app/core/plugins/switch-to-scoped/switch-to-scoped.component')

      xterm = fakeTerminals()

      saveAs = fakeSaveAs()

      TestBed.configureTestingModule({
        imports: [SwitchToScopedComponent],
        providers: [
          { provide: TERMINAL_FACTORY, useValue: xterm.factory },
          { provide: SAVE_AS, useValue: saveAs },
          provideRouter([]),
          provideTestTranslate(),
          provideFakes({ api, toastr, settings, activeModal, ws }),
          {
            provide: SWITCH_TO_SCOPED_MODAL_DATA,
            useValue: {
              plugin: makePlugin({
                name: 'homebridge-example',
                newHbScope: {
                  from: 'homebridge-example',
                  to: '@homebridge-plugins/homebridge-example',
                  switch: '2.0.0',
                } as any,
              }),
            },
          },
        ],
      })

      TestBed.overrideComponent(SwitchToScopedComponent, {
        set: { imports: [TranslatePipe], schemas: [NO_ERRORS_SCHEMA] },
      })

      options.arrange?.()

      navigate = vi.fn(async () => true)
      vi.spyOn(TestBed.inject(Router), 'navigate').mockImplementation(navigate as any)

      // The component looks the terminal target up by id rather than a view child
      const target = document.createElement('div')
      target.id = 'plugin-output'
      document.body.appendChild(target)

      const fixture = TestBed.createComponent(SwitchToScopedComponent)
      fixture.detectChanges()
      await settle()
      return { modal: fixture.componentInstance, target }
    }

    it('installs the new name, then removes the old one, in that order', async () => {
      // The other way round would leave the user with no working plugin if the
      // install failed
      const { modal } = await open()

      await modal.doSwitch()

      expect(io.requests.map(request => request.resource)).toEqual(['install', 'uninstall'])
      expect(io.requests[0].payload).toMatchObject({ name: '@homebridge-plugins/homebridge-example', version: '2.0.0' })
      expect(io.requests[1].payload).toMatchObject({ name: 'homebridge-example' })
    })

    it('asks for a full service restart and sends the user to it', async () => {
      const { modal } = await open()

      await modal.doSwitch()

      expect(api.lastCall('put')?.url).toBe('/platform-tools/hb-service/set-full-service-restart-flag')
      expect(activeModal.close).toHaveBeenCalled()
      expect(navigate).toHaveBeenCalledWith(['/restart'])
    })

    it('marks each step done as it finishes', async () => {
      const { modal } = await open()

      await modal.doSwitch()

      expect(modal.installed()).toBe(true)
      expect(modal.uninstalled()).toBe(true)
      expect(modal.failure()).toBe('')
    })

    it('stops before removing the old plugin when the install fails', async () => {
      // Removing it anyway would leave the user with nothing installed
      const { modal } = await open({
        arrange: () => io.socket.respondTo('install', { error: { message: 'not found on npm' } }),
      })

      await modal.doSwitch()

      expect(io.requests.map(request => request.resource)).toEqual(['install'])
      expect(modal.installed()).toBe(false)
      expect(modal.installing()).toBe(false)
      expect(modal.failure()).toBeTruthy()
      expect(activeModal.close).not.toHaveBeenCalled()
      expect(navigate).not.toHaveBeenCalled()
    })

    it('reports a failed removal without pretending it worked', async () => {
      const { modal } = await open({
        arrange: () => io.socket.respondTo('uninstall', { error: { message: 'permission denied' } }),
      })

      await modal.doSwitch()

      expect(modal.installed()).toBe(true)
      expect(modal.uninstalled()).toBe(false)
      expect(modal.uninstalling()).toBe(false)
      expect(toastr.error).toHaveBeenCalled()
    })

    it('shows the npm output in the terminal', async () => {
      const { modal } = await open()
      void modal

      io.socket.fire('stdout', 'added 1 package')

      expect(xterm.terminals.at(-1)!.written.join('')).toContain('added 1 package')
    })

    it('keeps a plain-text copy of the output for the log download', async () => {
      // ⚠️ Stripped of the colour codes: the downloaded file is meant to be
      // readable in a text editor, and readable in a bug report
      const { modal } = await open()

      io.socket.fire('stdout', '[32madded 1 package[0m\n')
      modal.downloadLogFile()

      expect(saveAs).toHaveBeenCalledWith(expect.any(Blob), 'homebridge-example-error.log')
      const saved = saveAs.mock.calls.at(-1)![0] as Blob
      expect(await saved.text()).toBe('added 1 package\r\n')
    })

    it('offers the online update everywhere but windows', async () => {
      // npm cannot replace a running package on Windows
      expect((await open({ platform: 'linux' })).modal.onlineUpdateOk()).toBe(true)
      expect((await open({ platform: 'win32' })).modal.onlineUpdateOk()).toBe(false)
    })

    it('closes the socket and the terminal when it goes away', async () => {
      const { modal } = await open()

      modal.ngOnDestroy()

      expect(io.end).toHaveBeenCalled()
      expect(xterm.terminals.at(-1)!.dispose).toHaveBeenCalled()
    })

    it('dismisses without switching anything', async () => {
      const { modal } = await open()

      modal.dismissModal()

      expect(io.requests).toEqual([])
      expect(activeModal.dismiss).toHaveBeenCalledWith('Dismiss')
    })
  })

  describe('the node version modal', () => {
    let plugins: FakeCache<any[]>
    let statusIo: FakeIoNamespace

    /**
     * Open the modal.
     * @param options - how to set it up
     * @param options.installed - the installed plugin list
     * @param options.nodeVersion - the version of node currently running
     * @param options.latestVersion - the version of node it could move to
     * @param options.policy - the saved node update policy
     * @param options.onUpdate - the callback the widget passes in
     * @param options.arrange - runs on the fresh fakes before the modal is built
     */
    async function open(options: {
      installed?: any[]
      nodeVersion?: string
      latestVersion?: string
      policy?: 'all' | 'major' | 'none'
      onUpdate?: () => Promise<void>
      arrange?: () => void
    } = {}) {
      TestBed.resetTestingModule()
      api = fakeApi()
      toastr = toastrStub()
      settings = makeSettings({ env: { nodeUpdatePolicy: options.policy ?? 'all' } as any })
      activeModal = activeModalStub()
      plugins = cacheStub<any[]>(options.installed ?? [])
      statusIo = fakeIoNamespace()
      statusIo.socket.respondTo('clear-nodejs-version-cache', {})

      const { NodeVersionModalComponent } = await import('@/app/modules/status/widgets/update-info-widget/node-version-modal/node-version-modal.component')

      xterm = fakeTerminals()

      saveAs = fakeSaveAs()

      TestBed.configureTestingModule({
        imports: [NodeVersionModalComponent],
        providers: [
          { provide: TERMINAL_FACTORY, useValue: xterm.factory },
          provideTestTranslate(),
          provideFakes({ api, toastr, settings, activeModal }),
          { provide: PluginsCacheService, useValue: plugins },
          {
            provide: NODE_VERSION_MODAL_DATA,
            useValue: {
              nodeVersion: options.nodeVersion ?? 'v22.11.0',
              latestVersion: options.latestVersion ?? '24.0.0',
              showNodeUnsupportedWarning: false,
              homebridgeRunningInSynologyPackage: false,
              homebridgeRunningInDocker: false,
              homebridgePkg: { engines: { node: '^20 || ^22 || ^24' } },
              architecture: 'arm64',
              supportsNodeJs24: true,
              onUpdate: options.onUpdate,
              statusIo,
            },
          },
        ],
      })

      TestBed.overrideComponent(NodeVersionModalComponent, {
        set: { imports: [TranslatePipe], schemas: [NO_ERRORS_SCHEMA] },
      })

      options.arrange?.()

      const fixture = TestBed.createComponent(NodeVersionModalComponent)
      fixture.detectChanges()
      await settle()
      return fixture.componentInstance
    }

    function plugin(name: string, node?: string) {
      return { name, displayName: name, engines: node ? { node } : undefined }
    }

    it('says whether each plugin supports the node version being offered', async () => {
      const modal = await open({
        installed: [plugin('homebridge-good', '^22 || ^24'), plugin('homebridge-old', '^18 || ^20')],
        latestVersion: '24.0.0',
      })

      const byName = Object.fromEntries(modal.installedPlugins().map(entry => [entry.name, entry.isSupported]))
      expect(byName['homebridge-good']).toBe('yes')
      expect(byName['homebridge-old']).toBe('no')
    })

    it('says unknown for a plugin that declares no engine range', async () => {
      // Not 'no' - it may well work, and marking it unsupported would scare the
      // user off an update they can safely take
      const modal = await open({ installed: [plugin('homebridge-quiet')] })

      const entry = modal.installedPlugins().find(item => item.name === 'homebridge-quiet')
      expect(entry?.isSupported).toBe('unknown')
    })

    it('puts homebridge itself at the top of the list', async () => {
      const modal = await open({ installed: [plugin('homebridge-example', '^22')] })

      expect(modal.installedPlugins()[0].name).toBe('homebridge')
      expect(modal.installedPlugins()[0].displayName).toBe('Homebridge')
    })

    it('judges homebridge against its own engine range', async () => {
      const modal = await open({ installed: [], latestVersion: '26.0.0' })

      // The default fixture supports 20, 22 and 24 - not 26
      expect(modal.installedPlugins()[0].isSupported).toBe('no')
    })

    it('puts this ui second, ahead of the other plugins', async () => {
      // It is the plugin the user is looking at, so it goes where they will see it
      const modal = await open({
        installed: [plugin('homebridge-aaa', '^22'), plugin('homebridge-config-ui-x', '^22')],
      })

      expect(modal.installedPlugins().map(entry => entry.name)).toEqual([
        'homebridge',
        'homebridge-config-ui-x',
        'homebridge-aaa',
      ])
    })

    it('sorts the rest by name', async () => {
      const modal = await open({
        installed: [plugin('homebridge-zebra', '^22'), plugin('homebridge-apple', '^22')],
      })

      expect(modal.installedPlugins().map(entry => entry.name)).toEqual([
        'homebridge',
        'homebridge-apple',
        'homebridge-zebra',
      ])
    })

    it('stops loading even when the plugin list cannot be read', async () => {
      const failing = cacheStub<any[]>([])
      failing.get = vi.fn(async () => {
        throw new Error('server unavailable')
      })
      TestBed.resetTestingModule()
      const modal = await open({ arrange: () => {
        plugins.get = failing.get
      } })

      expect(modal.loading()).toBe(false)
      expect(toastr.error).toHaveBeenCalledWith('plugins.toast_failed_to_load_plugins', 'toast.title_error')
    })

    it('knows whether the running node is already 24 or newer', async () => {
      expect((await open({ nodeVersion: 'v24.1.0' })).hasNode24OrAbove).toBe(true)
      expect((await open({ nodeVersion: 'v22.11.0' })).hasNode24OrAbove).toBe(false)
    })

    it('does not count a release candidate of 24 as being on 24', async () => {
      // semver sorts a prerelease BELOW its release, so `24.0.0-rc.1` does not
      // satisfy `>=24.0.0` even with prereleases included. Correct: someone on a
      // release candidate has not got the release
      const modal = await open({ nodeVersion: 'v24.0.0-rc.1' })

      expect(modal.hasNode24OrAbove).toBe(false)
    })

    it('starts on the saved update policy', async () => {
      const modal = await open({ policy: 'major' })

      expect(modal.nodeUpdatePolicyControl.value).toBe('major')
    })

    describe('changing the update policy', () => {
      it('saves it and clears the version cache the server holds', async () => {
        // Without clearing it the widget keeps offering the version the old
        // policy chose
        const modal = await open()

        await modal.updateNodeUpdatePolicy('major')

        expect(api.lastCall('patch')).toMatchObject({ url: '/config-editor/ui', body: { nodeUpdatePolicy: 'major' } })
        expect(statusIo.requests.map(request => request.resource)).toEqual(['clear-nodejs-version-cache'])
        expect(toastr.success).toHaveBeenCalled()
      })

      it('updates the settings the rest of the app reads', async () => {
        const modal = await open()

        await modal.updateNodeUpdatePolicy('major')

        expect((settings.env as any).nodeUpdatePolicy).toBe('major')
      })

      it('asks the widget to refresh itself', async () => {
        const onUpdate = vi.fn(async () => undefined)
        const modal = await open({ onUpdate })

        await modal.updateNodeUpdatePolicy('major')

        expect(onUpdate).toHaveBeenCalled()
      })

      it('puts the control back when the save fails', async () => {
        // Otherwise the modal shows a policy the server never accepted.
        //
        // ⚠️ Driven through the control rather than by calling the method
        // directly: calling it directly leaves the control on its original value
        // anyway, so the assertion passes whether or not anything reverts it
        vi.useFakeTimers()
        const modal = await open({ policy: 'all', arrange: () => api.fail('patch', '/config-editor/ui', new Error('read only config')) })

        modal.nodeUpdatePolicyControl.setValue('major')
        expect(modal.nodeUpdatePolicyControl.value).toBe('major')
        await vi.advanceTimersByTimeAsync(500)

        expect(modal.nodeUpdatePolicyControl.value).toBe('all')
        expect(toastr.error).toHaveBeenCalled()
      })

      it('saves after a pause rather than on every click of the radio group', async () => {
        vi.useFakeTimers()
        const modal = await open()

        modal.nodeUpdatePolicyControl.setValue('major')
        await vi.advanceTimersByTimeAsync(499)
        expect(api.callsTo('patch')).toEqual([])

        await vi.advanceTimersByTimeAsync(1)
        expect(api.callsTo('patch')).toHaveLength(1)
      })

      it('does not save the same policy twice in a row', async () => {
        // ⚠️ `distinctUntilChanged` compares against the previous EMISSION, not
        // against the saved value - so the first change is always written, even
        // when it matches what was already saved. Only a repeat is suppressed
        vi.useFakeTimers()
        const modal = await open({ policy: 'all' })

        modal.nodeUpdatePolicyControl.setValue('major')
        await vi.advanceTimersByTimeAsync(500)
        expect(api.callsTo('patch')).toHaveLength(1)

        modal.nodeUpdatePolicyControl.setValue('major')
        await vi.advanceTimersByTimeAsync(500)

        expect(api.callsTo('patch')).toHaveLength(1)
      })
    })

    it('falls back to the homebridge icon when a plugin icon will not load', async () => {
      const modal = await open({ installed: [plugin('homebridge-example', '^22')] })
      const entry = modal.installedPlugins().find(item => item.name === 'homebridge-example')!

      modal.handleIconError(entry)

      expect(entry.icon).toBe('assets/hb-icon.png')
    })

    it('dismisses without changing anything', async () => {
      const modal = await open()

      modal.dismissModal()

      expect(api.callsTo('patch')).toEqual([])
      expect(activeModal.dismiss).toHaveBeenCalledWith('Dismiss')
    })
  })
})

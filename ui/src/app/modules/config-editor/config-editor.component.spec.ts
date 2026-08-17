import type { FakeApi, FakeModalService, FakeToastr } from '@/testing'
import type { ComponentFixture } from '@angular/core/testing'

import { TestBed } from '@angular/core/testing'
import { ActivatedRoute, provideRouter } from '@angular/router'
import { NGX_MONACO_EDITOR_CONFIG } from 'ngx-monaco-editor-v2'
import { of } from 'rxjs'
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { RestartChildBridgesComponent } from '@/app/core/components/restart-child-bridges/restart-child-bridges.component'
import { RestartHomebridgeComponent } from '@/app/core/components/restart-homebridge/restart-homebridge.component'
import { CONFIG_RESTORE_MODAL_DATA, RESTART_CHILD_BRIDGES_MODAL_DATA } from '@/app/core/modal-data-tokens'
import { ChildBridgesService } from '@/app/core/utilities/child-bridges.service'
import { MobileDetectService } from '@/app/core/utilities/mobile-detect.service'
import { ConfigEditorComponent } from '@/app/modules/config-editor/config-editor.component'
import { ConfigRestoreComponent } from '@/app/modules/config-editor/config-restore/config-restore.component'
import { fakeApi, makeSettings, modalServiceSpy, toastrStub } from '@/testing'
import { provideFakes, provideTestTranslate } from '@/testing/providers'

/**
 * The config editor is the last line of defence before a broken config.json
 * reaches disk: a bad save here can stop Homebridge starting at all.
 *
 * Every spec runs the component in its plain-text mode. That is a real user
 * path (mobile, and an explicit preference), and it means the whole validation
 * chain is exercised without Monaco - which does not exist in a test browser.
 */
describe('ConfigEditorComponent', () => {
  let api: FakeApi
  let toastr: FakeToastr
  let modal: FakeModalService
  let fixture: ComponentFixture<ConfigEditorComponent>
  let component: ConfigEditorComponent

  const validConfig = {
    bridge: { name: 'Homebridge', username: '0E:12:34:56:78:9A', port: 51826, pin: '031-45-154' },
    accessories: [],
    platforms: [{ platform: 'config', name: 'Config' }],
  }

  function create(config: Record<string, any> = validConfig): ConfigEditorComponent {
    api = fakeApi().respond('post', /^\/config-editor/, { config, affectedBridges: [] })
    toastr = toastrStub()
    modal = modalServiceSpy()

    TestBed.configureTestingModule({
      imports: [ConfigEditorComponent],
      providers: [
        provideRouter([]),
        provideTestTranslate(),
        provideFakes({ api, settings: makeSettings(), toastr, modal }),
        // Plain text mode: no Monaco anywhere in the component
        { provide: MobileDetectService, useValue: { detect: { mobile: () => 'iPhone' }, disableTouchMove: vi.fn(), enableTouchMove: vi.fn() } },
        { provide: ChildBridgesService, useValue: { getAll: vi.fn(async () => []) } },
        { provide: ActivatedRoute, useValue: { data: of({ config: JSON.stringify(config, null, 4) }) } },
        // ⚠️ One case flips the editor back out of plain text, and the real
        // monaco component is then built by the change detection that follows.
        // Without its config token that throws asynchronously, outside any test:
        // every test still reports as passing while the run fails on exit code
        { provide: NGX_MONACO_EDITOR_CONFIG, useValue: {} },
      ],
    })

    fixture = TestBed.createComponent(ConfigEditorComponent)
    component = fixture.componentInstance
    fixture.detectChanges()
    return component
  }

  /** Put text in the editor and save it, as a user typing would. */
  async function save(text: string): Promise<void> {
    component.homebridgeConfig.set(text)
    await component.onSave()
  }

  /** Let the restore chain of awaits settle. */
  async function settleRestore() {
    for (let tick = 0; tick < 12; tick += 1) {
      await Promise.resolve()
    }
  }

  /** The translation key of the last error the user was shown. */
  function lastError(): string | undefined {
    return toastr.at('error').at(-1)?.message
  }

  beforeEach(() => {
    // The page styles the layout's content wrapper on the way in and clears it
    // again on the way out. It has to outlive the fixture, because Angular
    // destroys the component after this file's own cleanup has run
    if (!document.querySelector('.content')) {
      const content = document.createElement('div')
      content.className = 'content'
      document.body.appendChild(content)
    }

    create()
  })

  afterAll(() => {
    document.querySelector('.content')?.remove()
  })

  describe('refusing a config that would break homebridge', () => {
    it.each([
      [
        'no bridge block at all',
        { platforms: [] },
        'config.config_bridge_missing',
      ],
      [
        'a bridge that is not an object',
        { bridge: 'homebridge' },
        'config.config_bridge_missing',
      ],
      [
        'a malformed bridge username',
        { bridge: { username: 'not-a-mac' } },
        'config.config_username_error',
      ],
      [
        'accessories that are not a list',
        { bridge: validConfig.bridge, accessories: { first: {} } },
        'config.config_accessory_must_be_array',
      ],
      [
        'platforms that are not a list',
        { bridge: validConfig.bridge, platforms: { first: {} } },
        'config.config_platform_must_be_array',
      ],
      [
        'a platform entry that is not an object',
        { bridge: validConfig.bridge, platforms: ['config'] },
        'config.error_blocks_objects',
      ],
      [
        'a platform entry with no platform name',
        { bridge: validConfig.bridge, platforms: [{ name: 'Config' }] },
        'config.error_blocks_type',
      ],
      [
        'a platform name that is not text',
        { bridge: validConfig.bridge, platforms: [{ platform: 42 }] },
        'config.error_string_type',
      ],
      [
        'an accessory entry with no accessory name',
        { bridge: validConfig.bridge, accessories: [{ name: 'Lamp' }] },
        'config.error_blocks_type',
      ],
      [
        'a plugin list holding something other than names',
        { bridge: validConfig.bridge, plugins: ['homebridge-hue', 42] },
        'config.error_string_array',
      ],
      [
        'a disabled plugin list holding something other than names',
        { bridge: validConfig.bridge, disabledPlugins: [{ name: 'homebridge-hue' }] },
        'config.error_string_array',
      ],
    ])('refuses %s', async (_case, config, expectedError) => {
      await save(JSON.stringify(config))

      expect(lastError()).toBe(expectedError)
      // Nothing reaches the server: the point is that the broken config never
      // gets written
      expect(api.callsTo('post', /config-editor/)).toHaveLength(0)
    })

    it('refuses text that is not json at all', async () => {
      await save('this is not json {{{')

      expect(lastError()).toBe('config.config_invalid_json')
      expect(api.callsTo('post', /config-editor/)).toHaveLength(0)
    })
  })

  describe('accepting a good config', () => {
    it('saves it', async () => {
      await save(JSON.stringify(validConfig))

      expect(api.callsTo('post', /config-editor/)).toHaveLength(1)
    })

    it('accepts a config with no optional sections', async () => {
      await save(JSON.stringify({ bridge: validConfig.bridge }))

      expect(api.callsTo('post', /config-editor/)).toHaveLength(1)
    })

    it('tidies the config before saving it', async () => {
      await save('{"bridge":{"username":"0E:12:34:56:78:9A"},"platforms":[]}')

      // Re-indenting on save is what makes a later error easy to spot
      expect(component.homebridgeConfig()).toContain('\n    "bridge"')
    })

    it('accepts relaxed json and normalises it', async () => {
      // Trailing commas and comments are what people actually paste out of a
      // plugin's readme, so they are tolerated rather than rejected
      await save(`{
        // the bridge
        "bridge": { "username": "0E:12:34:56:78:9A" },
        "platforms": [],
      }`)

      expect(api.callsTo('post', /config-editor/)).toHaveLength(1)
      expect(component.homebridgeConfig()).not.toContain('//')
    })
  })

  describe('while a save is already running', () => {
    it('ignores a second save', async () => {
      component.homebridgeConfig.set(JSON.stringify(validConfig))
      const first = component.onSave()
      const second = component.onSave()
      await Promise.all([first, second])

      expect(api.callsTo('post', /config-editor/)).toHaveLength(1)
    })
  })

  describe('leaving the page', () => {
    it('lets the user leave when nothing has changed', async () => {
      const decision = await component.canDeactivate()

      expect(decision).toBe(true)
      expect(modal.open).not.toHaveBeenCalled()
    })

    it('asks before dropping unsaved edits', async () => {
      component.homebridgeConfig.set(JSON.stringify({ ...validConfig, bridge: { ...validConfig.bridge, name: 'Renamed' } }))

      const decision = component.canDeactivate()
      modal.lastOpened()!.ref.close(true)

      // Confirming means the user accepts losing the edit
      await expect(decision).resolves.toBe(true)
    })

    it('keeps the user on the page when they change their mind', async () => {
      component.homebridgeConfig.set(JSON.stringify({ ...validConfig, bridge: { ...validConfig.bridge, name: 'Renamed' } }))

      const decision = component.canDeactivate()
      modal.lastOpened()!.ref.dismiss()

      await expect(decision).resolves.toBe(false)
    })
  })

  /**
   * Which restart a save needs.
   *
   * ⚠️ **This is the difference between reloading one plugin and dropping every
   * accessory in the house off the network for a minute.** A save that only
   * touched a plugin running on its own child bridge should restart that bridge
   * alone; anything that could affect Homebridge itself must restart the lot. The
   * eight checks below are the whole of that decision, and each one is a case
   * where guessing "child" would leave the change unapplied.
   */
  describe('deciding what has to restart', () => {
    const bridged = (platform: string, username = '0E:11:22:33:44:55', extra: Record<string, any> = {}) => ({
      platform,
      name: platform,
      _bridge: { username },
      ...extra,
    })

    /**
     * Ask what a save would need.
     * @param options - the before and after
     * @param options.saved - the config as last saved
     * @param options.edited - the config in the editor now
     * @param options.bridges - the child bridges the save response reported
     * @param options.pending - whether homebridge is already awaiting a restart
     * @param options.queued - bridges already queued for restart
     */
    async function restartFor(options: {
      saved: Record<string, any>
      edited?: Record<string, any>
      bridges?: any[]
      pending?: boolean
      queued?: any[]
    }): Promise<string> {
      const page = component as any
      page.latestSavedConfig = options.saved
      page.hbPendingRestart = options.pending ?? false
      page.childBridgesToRestart = options.queued ?? []
      component.homebridgeConfig.set(JSON.stringify(options.edited ?? options.saved, null, 4))
      return page.determineRestartType(options.bridges)
    }

    it('restarts everything when homebridge is already waiting to restart', async () => {
      // Whatever else changed, the pending change still has to be applied
      const saved = { bridge: { name: 'Homebridge' }, platforms: [bridged('example')] }

      expect(await restartFor({ saved, pending: true })).toBe('full')
    })

    it('restarts nothing when the config is unchanged', async () => {
      const saved = { bridge: { name: 'Homebridge' }, platforms: [] }

      expect(await restartFor({ saved })).toBe('none')
      expect(toastr.at('info').at(-1)?.title).toBe('config.config_saved')
    })

    it('still restarts when nothing changed but a bridge is already queued', async () => {
      // The queue comes from an earlier save in the same visit
      const saved = { bridge: { name: 'Homebridge' }, platforms: [] }

      expect(await restartFor({ saved, queued: [{ username: 'AA' }] })).not.toBe('none')
    })

    it('restarts everything when a top level key is added', async () => {
      const saved = { bridge: { name: 'Homebridge' }, platforms: [bridged('example')] }

      expect(await restartFor({ saved, edited: { ...saved, mdns: { interface: 'eth0' } } })).toBe('full')
    })

    it('restarts everything when a top level key is removed', async () => {
      const saved = { bridge: { name: 'Homebridge' }, ports: { start: 52100 }, platforms: [bridged('example')] }
      const edited = { bridge: { name: 'Homebridge' }, platforms: [bridged('example')] }

      expect(await restartFor({ saved, edited })).toBe('full')
    })

    it('restarts everything when nothing runs on a child bridge', async () => {
      // There is nothing smaller to restart
      const saved = { bridge: { name: 'Homebridge' }, platforms: [{ platform: 'example', name: 'Example' }] }
      const edited = { bridge: { name: 'Homebridge' }, platforms: [{ platform: 'example', name: 'Changed' }] }

      expect(await restartFor({ saved, edited })).toBe('full')
    })

    it('treats an empty bridge block as not being on a child bridge', async () => {
      const saved = { bridge: { name: 'Homebridge' }, platforms: [{ platform: 'example', _bridge: {} }] }
      const edited = { bridge: { name: 'Homebridge' }, platforms: [{ platform: 'example', _bridge: {}, name: 'Changed' }] }

      expect(await restartFor({ saved, edited })).toBe('full')
    })

    it('restarts everything when a bridge setting changed', async () => {
      const saved = { bridge: { name: 'Homebridge', port: 51826 }, platforms: [bridged('example')] }
      const edited = { bridge: { name: 'Homebridge', port: 51827 }, platforms: [bridged('example')] }

      expect(await restartFor({ saved, edited })).toBe('full')
    })

    it('restarts everything when a platform is added', async () => {
      const saved = { bridge: {}, platforms: [bridged('example')] }
      const edited = { bridge: {}, platforms: [bridged('example'), bridged('other', 'AA:BB:CC:DD:EE:FF')] }

      expect(await restartFor({ saved, edited })).toBe('full')
    })

    it('restarts everything when an accessory is removed', async () => {
      const saved = { bridge: {}, platforms: [bridged('example')], accessories: [{ accessory: 'Light', _bridge: { username: 'AA' } }] }
      const edited = { bridge: {}, platforms: [bridged('example')], accessories: [] }

      expect(await restartFor({ saved, edited })).toBe('full')
    })

    it('restarts everything when a plugin is moved onto a child bridge', async () => {
      // The bridge itself has to be created, which homebridge only does at startup
      const saved = { bridge: {}, platforms: [{ platform: 'example' }, bridged('other', 'AA:BB:CC:DD:EE:FF')] }
      const edited = { bridge: {}, platforms: [bridged('example'), bridged('other', 'AA:BB:CC:DD:EE:FF')] }

      expect(await restartFor({ saved, edited })).toBe('full')
    })

    it('restarts everything when the ui own config changed', async () => {
      // Restarting the UI's own bridge would not reload the UI itself.
      //
      // ⚠️ Both bridges are supplied deliberately. Without them the lookup below
      // fails to find either one and answers 'full' for that reason instead, and
      // this case passes whether the ui-config check exists or not
      const saved = { bridge: {}, platforms: [bridged('config'), bridged('example', 'AA:BB:CC:DD:EE:FF')] }
      const edited = { bridge: {}, platforms: [bridged('config', '0E:11:22:33:44:55', { port: 8582 }), bridged('example', 'AA:BB:CC:DD:EE:FF')] }

      const decision = await restartFor({
        saved,
        edited,
        bridges: [
          { name: 'UI Bridge', username: '0E:11:22:33:44:55' },
          { name: 'Example Bridge', username: 'AA:BB:CC:DD:EE:FF' },
        ],
      })

      expect(decision).toBe('full')
    })

    it('restarts everything when a changed plugin is not on a bridge', async () => {
      const saved = { bridge: {}, platforms: [bridged('example'), { platform: 'other', name: 'Other' }] }
      const edited = { bridge: {}, platforms: [bridged('example'), { platform: 'other', name: 'Renamed' }] }

      expect(await restartFor({ saved, edited })).toBe('full')
    })

    it('restarts just the child bridge of the plugin that changed', async () => {
      // The whole point of the exercise
      const saved = { bridge: {}, platforms: [bridged('example')] }
      const edited = { bridge: {}, platforms: [bridged('example', '0E:11:22:33:44:55', { debug: true })] }

      const decision = await restartFor({
        saved,
        edited,
        bridges: [{ name: 'Example Bridge', username: '0E:11:22:33:44:55' }],
      })

      expect(decision).toBe('child')
      expect((component as any).childBridgesToRestart).toEqual([
        { name: 'Example Bridge', username: '0E:11:22:33:44:55', matterSerialNumber: undefined },
      ])
    })

    it('matches the bridge whatever case the config wrote its username in', async () => {
      const saved = { bridge: {}, platforms: [bridged('example', '0e:11:22:33:44:55')] }
      const edited = { bridge: {}, platforms: [bridged('example', '0e:11:22:33:44:55', { debug: true })] }

      const decision = await restartFor({
        saved,
        edited,
        bridges: [{ name: 'Example Bridge', username: '0E:11:22:33:44:55' }],
      })

      expect(decision).toBe('child')
    })

    it('carries the matter serial number, so a matter bridge can be found', async () => {
      const saved = { bridge: {}, platforms: [bridged('example')] }
      const edited = { bridge: {}, platforms: [bridged('example', '0E:11:22:33:44:55', { debug: true })] }

      await restartFor({
        saved,
        edited,
        bridges: [{ name: 'Example Bridge', username: '0E:11:22:33:44:55', matterSerialNumber: 'MTR-1' }],
      })

      expect((component as any).childBridgesToRestart[0].matterSerialNumber).toBe('MTR-1')
    })

    it('queues a bridge once, however many of its entries changed', async () => {
      const saved = { bridge: {}, platforms: [bridged('a'), bridged('b')] }
      const edited = {
        bridge: {},
        platforms: [bridged('a', '0E:11:22:33:44:55', { debug: true }), bridged('b', '0E:11:22:33:44:55', { debug: true })],
      }

      await restartFor({ saved, edited, bridges: [{ name: 'Shared', username: '0E:11:22:33:44:55' }] })

      expect((component as any).childBridgesToRestart).toHaveLength(1)
    })

    it('restarts everything when the bridge it needs is not running', async () => {
      // Nothing to send the restart to
      const saved = { bridge: {}, platforms: [bridged('example')] }
      const edited = { bridge: {}, platforms: [bridged('example', '0E:11:22:33:44:55', { debug: true })] }

      expect(await restartFor({ saved, edited, bridges: [] })).toBe('full')
    })

    it('restarts everything when a bridge block has no username', async () => {
      const saved = { bridge: {}, platforms: [{ platform: 'example', _bridge: { port: 52100 } }, bridged('other', 'AA:BB:CC:DD:EE:FF')] }
      const edited = { bridge: {}, platforms: [{ platform: 'example', _bridge: { port: 52101 } }, bridged('other', 'AA:BB:CC:DD:EE:FF')] }

      expect(await restartFor({ saved, edited })).toBe('full')
    })

    it('asks the server for the bridges when the save did not report them', async () => {
      const saved = { bridge: {}, platforms: [bridged('example')] }
      const edited = { bridge: {}, platforms: [bridged('example', '0E:11:22:33:44:55', { debug: true })] }
      const childBridges = TestBed.inject(ChildBridgesService)
      vi.mocked(childBridges.getAll).mockResolvedValue([{ name: 'Example Bridge', username: '0E:11:22:33:44:55' }] as any)

      expect(await restartFor({ saved, edited })).toBe('child')
      expect(childBridges.getAll).toHaveBeenCalled()
    })

    it('does not ask when the save already reported them', async () => {
      // Saved a round trip in Phase 7
      const saved = { bridge: {}, platforms: [bridged('example')] }
      const edited = { bridge: {}, platforms: [bridged('example', '0E:11:22:33:44:55', { debug: true })] }
      const childBridges = TestBed.inject(ChildBridgesService)
      vi.mocked(childBridges.getAll).mockClear()

      await restartFor({ saved, edited, bridges: [{ name: 'Example Bridge', username: '0E:11:22:33:44:55' }] })

      expect(childBridges.getAll).not.toHaveBeenCalled()
    })

    it('restarts everything when the bridge list cannot be read', async () => {
      // The safe answer: a full restart applies the change either way
      const saved = { bridge: {}, platforms: [bridged('example')] }
      const edited = { bridge: {}, platforms: [bridged('example', '0E:11:22:33:44:55', { debug: true })] }
      const childBridges = TestBed.inject(ChildBridgesService)
      vi.mocked(childBridges.getAll).mockRejectedValue(new Error('server unavailable'))
      vi.spyOn(console, 'error').mockImplementation(() => {})

      expect(await restartFor({ saved, edited })).toBe('full')
    })
  })

  /**
   * The plain-text editor, which is what mobile gets and what anyone can choose.
   *
   * ⚠️ **Monaco edits only reach `homebridgeConfig` on save.** The textarea renders
   * from that signal, so switching to plain text has to carry the current Monaco
   * value across first — otherwise everything typed since the last save disappears
   * the moment the toggle is flipped.
   */
  describe('switching between the two editors', () => {
    /**
     * Pretend Monaco is the active editor, holding the given text.
     * @param value - what the model currently holds
     */
    function withMonaco(value: string) {
      const model = { getValue: vi.fn(() => value), setValue: vi.fn() }
      const editor = { getModel: vi.fn(() => model), focus: vi.fn() }
      ;(component as any).monacoEditor = editor
      component.preferPlainTextEditor.set(false)
      // ⚠️ Monaco counts as active only when the page is not in mobile mode. The
      // rest of this file runs the component as mobile on purpose, so without
      // clearing that flag the Monaco branch is unreachable and these cases would
      // pass while testing nothing
      component.isMobile.set(false)
      return { editor, model }
    }

    it('carries unsaved monaco edits into the plain text box', () => {
      const { model } = withMonaco('{ "typed": "but not saved" }')

      component.setPlainTextEditor(true)

      expect(model.getValue).toHaveBeenCalled()
      expect(component.homebridgeConfig()).toBe('{ "typed": "but not saved" }')
    })

    it('remembers the choice for next time', () => {
      withMonaco('{}')

      component.setPlainTextEditor(true)

      expect(window.localStorage.getItem('hb_config_editor_plaintext')).toBe('true')
      expect(component.preferPlainTextEditor()).toBe(true)
    })

    it('remembers going back to monaco too', () => {
      withMonaco('{}')
      component.setPlainTextEditor(true)

      component.setPlainTextEditor(false)

      expect(window.localStorage.getItem('hb_config_editor_plaintext')).toBe('false')
    })

    it('does nothing when the editor is already the one asked for', () => {
      const { model } = withMonaco('{}')

      component.setPlainTextEditor(false)

      expect(model.getValue).not.toHaveBeenCalled()
    })

    it('still switches when the choice cannot be stored', () => {
      // Private browsing blocks the write, and losing the toggle would be worse
      const { model } = withMonaco('{ "typed": true }')
      vi.spyOn(window.localStorage, 'setItem').mockImplementation(() => {
        throw new Error('quota exceeded')
      })

      expect(() => component.setPlainTextEditor(true)).not.toThrow()
      expect(component.preferPlainTextEditor()).toBe(true)
      expect(model.getValue).toHaveBeenCalled()
    })

    it('switches anyway when monaco cannot be read', () => {
      const editor = {
        getModel: vi.fn(() => {
          throw new Error('editor disposed')
        }),
      }
      ;(component as any).monacoEditor = editor
      component.preferPlainTextEditor.set(false)
      component.isMobile.set(false)
      vi.spyOn(console, 'error').mockImplementation(() => {})

      component.setPlainTextEditor(true)

      expect(component.preferPlainTextEditor()).toBe(true)
      expect(console.error).toHaveBeenCalled()
    })

    it('pushes the edited config back into monaco on the way back', async () => {
      vi.useFakeTimers()
      const { model, editor } = withMonaco('{}')
      component.setPlainTextEditor(true)
      component.homebridgeConfig.set('{ "edited": "in the textarea" }')

      component.setPlainTextEditor(false)
      await vi.advanceTimersByTimeAsync(0)

      expect(model.setValue).toHaveBeenCalledWith('{ "edited": "in the textarea" }')
      expect(editor.focus).toHaveBeenCalled()
      vi.useRealTimers()
    })
  })

  describe('the side by side diff', () => {
    it('turns it on and off', () => {
      expect(component.renderSideBySide()).toBe(false)

      component.toggleSideBySide()
      expect(component.renderSideBySide()).toBe(true)

      component.toggleSideBySide()
      expect(component.renderSideBySide()).toBe(false)
    })

    it('tells the editor which way to render', () => {
      component.toggleSideBySide()

      expect(component.editorOptions.renderSideBySide).toBe(true)
    })
  })

  describe('restoring an older config', () => {
    it('offers the backups, and says whether it came from the settings page', async () => {
      void component.onRestore(true)
      await Promise.resolve()

      expect(modal.lastOpened()!.content).toBe(ConfigRestoreComponent)
      expect(modal.dataFor(CONFIG_RESTORE_MODAL_DATA)).toMatchObject({ fromSettings: true })
    })

    it('hands the modal the config on screen, to compare against', async () => {
      component.homebridgeConfig.set('{ "current": true }')

      void component.onRestore()
      await Promise.resolve()

      expect(modal.dataFor(CONFIG_RESTORE_MODAL_DATA)?.currentConfig).toBe('{ "current": true }')
    })

    it('loads the chosen backup into the editor, formatted', async () => {
      api.respond('get', '/config-editor/backups/12345', { bridge: { name: 'Restored' } })

      void component.onRestore()
      await Promise.resolve()
      modal.lastOpened()!.ref.close('12345')
      await settleRestore()

      expect(component.homebridgeConfig()).toBe('{\n    "bridge": {\n        "name": "Restored"\n    }\n}')
    })

    it('keeps the config it replaced, so the diff has something to show', async () => {
      component.homebridgeConfig.set('{ "current": true }')
      api.respond('get', '/config-editor/backups/12345', { restored: true })

      void component.onRestore()
      await Promise.resolve()
      modal.lastOpened()!.ref.close('12345')
      await settleRestore()

      expect(component.originalConfig()).toBe('{ "current": true }')
    })

    it('says a backup was loaded, because nothing is saved yet', async () => {
      // The user still has to press save
      api.respond('get', '/config-editor/backups/12345', { restored: true })

      void component.onRestore()
      await Promise.resolve()
      modal.lastOpened()!.ref.close('12345')
      await settleRestore()

      expect(toastr.at('info').at(-1)?.title).toBe('config.title_backup_loaded')
    })

    it('leaves the editor alone when the backup list is dismissed', async () => {
      component.homebridgeConfig.set('{ "current": true }')

      void component.onRestore()
      await Promise.resolve()
      modal.lastOpened()!.ref.dismiss()
      await settleRestore()

      expect(component.homebridgeConfig()).toBe('{ "current": true }')
      expect(component.originalConfig()).toBe('')
    })

    it('puts the original config back when the restore is abandoned', async () => {
      component.originalConfig.set('{ "the original": true }')
      component.homebridgeConfig.set('{ "the backup": true }')

      component.onCancelRestore()

      expect(component.homebridgeConfig()).toBe('{ "the original": true }')
      expect(component.originalConfig()).toBe('')
    })

    it('folds the diff back to one pane when the restore is abandoned', async () => {
      component.toggleSideBySide()
      component.originalConfig.set('{}')

      component.onCancelRestore()

      expect(component.renderSideBySide()).toBe(false)
    })
  })

  /**
   * Whether a save needs the whole service restarted, or just Homebridge.
   *
   * ⚠️ **Changing the UI's own config entry needs the service restarted, not just
   * Homebridge.** The UI runs inside that service; restarting Homebridge alone
   * leaves the UI running on its old port, settings and SSL certificate, and the
   * user is left looking at a page that no longer matches the config on disk.
   */
  /**
   * Acting on the restart decision.
   *
   * ⚠️ **Declining the prompt is not the same as not needing one.** The config is
   * already on disk either way, so a "not now" has to leave the page remembering
   * that a restart is still owed — otherwise the next save sees nothing pending
   * and the user's earlier change never gets applied.
   */
  describe('acting on the restart decision', () => {
    /** Run the restart step for a decision the page has already made. */
    async function restartAfter(type: 'full' | 'child', options: {
      queued?: any[]
      serviceRestart?: boolean
    } = {}) {
      const page = component as any
      page.childBridgesToRestart = options.queued ?? []
      page.hbPendingRestart = false

      const pending = type === 'full'
        ? page.performFullRestart(options.serviceRestart ?? false)
        : page.performChildBridgeRestart()
      await settleRestore()
      return { page, pending }
    }

    it('offers the full restart prompt, and will not let it be clicked away', async () => {
      const { pending } = await restartAfter('full')

      expect(modal.lastOpened()!.content).toBe(RestartHomebridgeComponent)
      expect(modal.lastOpened()!.options).toMatchObject({ size: 'lg', backdrop: 'static' })

      modal.lastOpened()!.ref.close()
      await pending
    })

    it('flags a full service restart when the ui config itself changed', async () => {
      // ⚠️ Restarting homebridge alone would not reload the UI's own settings, so
      // the change would sit on disk looking applied
      const { pending } = await restartAfter('full', { serviceRestart: true })

      expect(api.lastCall('put', '/platform-tools/hb-service/set-full-service-restart-flag')).toBeDefined()

      modal.lastOpened()!.ref.close()
      await pending
    })

    it('does not flag one for an ordinary config change', async () => {
      const { pending } = await restartAfter('full')

      expect(api.callsTo('put', '/platform-tools/hb-service/set-full-service-restart-flag')).toEqual([])

      modal.lastOpened()!.ref.close()
      await pending
    })

    it('clears what was owed once the restart is accepted', async () => {
      const { page, pending } = await restartAfter('full', {
        queued: [{ name: 'Example Bridge', username: '0E:11:22:33:44:55' }],
      })

      modal.lastOpened()!.ref.close()
      await pending

      expect(page.hbPendingRestart).toBe(false)
      expect(page.childBridgesToRestart).toEqual([])
    })

    it('remembers a restart is still owed when the user says not now', async () => {
      const { page, pending } = await restartAfter('full')

      modal.lastOpened()!.ref.dismiss()
      await pending

      expect(page.hbPendingRestart).toBe(true)
    })

    it('offers the child bridge prompt with the bridges it queued', async () => {
      const queued = [{ name: 'Example Bridge', username: '0E:11:22:33:44:55' }]

      const { pending } = await restartAfter('child', { queued })

      expect(modal.lastOpened()!.content).toBe(RestartChildBridgesComponent)
      expect(modal.dataFor(RESTART_CHILD_BRIDGES_MODAL_DATA)).toMatchObject({ bridges: queued })

      modal.lastOpened()!.ref.close()
      await pending
    })

    it('empties the queue once the child bridges have restarted', async () => {
      const { page, pending } = await restartAfter('child', {
        queued: [{ name: 'Example Bridge', username: '0E:11:22:33:44:55' }],
      })

      modal.lastOpened()!.ref.close()
      await pending

      expect(page.childBridgesToRestart).toEqual([])
    })

    it('keeps the bridges queued when the user says not now', async () => {
      // ⚠️ They are still running the old config, so dropping them here would lose
      // the restart entirely
      const queued = [{ name: 'Example Bridge', username: '0E:11:22:33:44:55' }]

      const { page, pending } = await restartAfter('child', { queued })

      modal.lastOpened()!.ref.dismiss()
      await pending

      expect(page.childBridgesToRestart).toEqual(queued)
    })

    it('falls through to a full restart when there is no bridge to restart', async () => {
      // The decision said "child" but the list came back empty, and doing nothing
      // at all would leave the change unapplied with no prompt
      const { pending } = await restartAfter('child', { queued: [] })

      expect(modal.lastOpened()!.content).toBe(RestartHomebridgeComponent)

      modal.lastOpened()!.ref.close()
      await pending
    })
  })

  /**
   * Tidying up on the way out.
   *
   * ⚠️ **Monaco's models outlive the component.** They are held globally by URI, so
   * a model left behind means the next visit builds a second one at the same URI —
   * and Monaco can then fail to attach the JSON schema to the new editor, which
   * turns off config validation with nothing on screen to say so.
   */
  describe('tidying up on the way out', () => {
    /**
     * Put a stub monaco on the window, and report what it disposed.
     * @param present - the URIs that already have a model
     */
    function withGlobalMonaco(present: string[]) {
      const disposed: string[] = []
      const models = new Map(present.map(uri => [uri, { dispose: () => disposed.push(uri) }]))
      const diagnostics = {
        schemas: [{ uri: 'http://homebridge/config.json' }, { uri: 'http://someone-else/schema.json' }],
      }
      const setDiagnosticsOptions = vi.fn()

      ;(window as any).monaco = {
        Uri: { parse: (uri: string) => uri },
        editor: { getModel: (uri: string) => models.get(uri) },
        languages: { json: { jsonDefaults: { diagnosticsOptions: diagnostics, setDiagnosticsOptions } } },
      }

      return { disposed, setDiagnosticsOptions }
    }

    afterEach(() => {
      delete (window as any).monaco
      delete (window as any).editor
    })

    it.each([
      ['the diff view original', 'file:///original.json'],
      ['the diff view modified', 'file:///modified.json'],
      ['the main editor', 'a://homebridge/config.json'],
    ])('disposes %s model', (_case, uri) => {
      const { disposed } = withGlobalMonaco([uri])

      component.ngOnDestroy()

      expect(disposed).toEqual([uri])
    })

    it('leaves alone a model that was never created', () => {
      const { disposed } = withGlobalMonaco([])

      expect(() => component.ngOnDestroy()).not.toThrow()
      expect(disposed).toEqual([])
    })

    it('takes its own schema back out of the shared validator', () => {
      // ⚠️ The schema list is global: leaving the homebridge config schema behind
      // makes every other monaco editor in the app validate against it
      const { setDiagnosticsOptions } = withGlobalMonaco([])

      component.ngOnDestroy()

      expect(setDiagnosticsOptions).toHaveBeenCalledWith(
        expect.objectContaining({ schemas: [{ uri: 'http://someone-else/schema.json' }] }),
      )
    })

    it('disposes the editor it was given', () => {
      withGlobalMonaco([])
      const dispose = vi.fn()
      ;(component as any).monacoEditor = { dispose }

      component.ngOnDestroy()

      expect(dispose).toHaveBeenCalled()
    })

    it('disposes the global editor and forgets it', () => {
      withGlobalMonaco([])
      const dispose = vi.fn()
      ;(window as any).editor = { dispose }

      component.ngOnDestroy()

      expect(dispose).toHaveBeenCalled()
      expect((window as any).editor).toBeUndefined()
    })

    it('leaves without monaco ever having loaded', () => {
      // Plain-text mode on mobile never builds it, and throwing here would leave
      // the layout's height style behind on every other page
      expect(() => component.ngOnDestroy()).not.toThrow()
    })

    it('carries on when disposing throws', () => {
      // ⚠️ Deliberately swallowed: a failure to tidy up must not stop the page
      // being left, or the user is stuck on it
      withGlobalMonaco([])
      ;(component as any).monacoEditor = {
        dispose: () => {
          throw new Error('already disposed')
        },
      }

      expect(() => component.ngOnDestroy()).not.toThrow()
    })

    it('gives the layout its height back', () => {
      // The page stretches the layout's content wrapper to fill the screen, and
      // every other page would inherit that height
      const removeStyle = vi.spyOn((component as any).$renderer, 'removeStyle')

      component.ngOnDestroy()

      expect(removeStyle).toHaveBeenCalledWith(expect.anything(), 'height')
    })
  })

  describe('deciding whether the service itself has to restart', () => {
    /**
     * Ask whether the ui config entry changed.
     * @param saved - the config as last saved
     * @param edited - the config in the editor now
     */
    function serviceRestartFor(saved: Record<string, any>, edited: Record<string, any>): boolean {
      const page = component as any
      page.latestSavedConfig = saved
      component.homebridgeConfig.set(JSON.stringify(edited, null, 4))
      return page.detectConfigPlatformChanges()
    }

    const ui = (overrides: Record<string, any> = {}) => ({ platform: 'config', name: 'Config', port: 8581, ...overrides })

    it('says yes when a ui setting changed', () => {
      expect(serviceRestartFor(
        { platforms: [ui()] },
        { platforms: [ui({ port: 8582 })] },
      )).toBe(true)
    })

    it('says yes when the ui entry was added', () => {
      expect(serviceRestartFor({ platforms: [] }, { platforms: [ui()] })).toBe(true)
    })

    it('says yes when the ui entry was removed', () => {
      // Which stops the UI coming back at all, so the service has to restart
      expect(serviceRestartFor({ platforms: [ui()] }, { platforms: [] })).toBe(true)
    })

    it('says no when the ui entry is untouched', () => {
      expect(serviceRestartFor(
        { platforms: [ui(), { platform: 'other', name: 'Other' }] },
        { platforms: [ui(), { platform: 'other', name: 'Renamed' }] },
      )).toBe(false)
    })

    it('says no when there is no ui entry either side', () => {
      expect(serviceRestartFor({ platforms: [] }, { platforms: [] })).toBe(false)
    })

    it('says no when the config has no platforms at all', () => {
      expect(serviceRestartFor({}, {})).toBe(false)
    })

    it('says no when the edited config cannot be read', () => {
      // ⚠️ Deliberately the *less* disruptive answer, and worth knowing which way
      // round it goes: restarting the whole service tears down the UI the user is
      // looking at, so an unreadable config falls back to restarting Homebridge
      // alone. This is only reachable if the config parsed well enough to save and
      // then failed to parse here, so it is a belt-and-braces branch either way
      const page = component as any
      page.latestSavedConfig = { platforms: [ui()] }
      component.homebridgeConfig.set('{ not json')
      vi.spyOn(console, 'error').mockImplementation(() => {})

      expect(page.detectConfigPlatformChanges()).toBe(false)
      expect(console.error).toHaveBeenCalled()
    })
  })
})

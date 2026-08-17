import type { FakeApi, FakeSettings } from '@/testing'

import { NO_ERRORS_SCHEMA } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { provideRouter, Router } from '@angular/router'
import { TranslatePipe } from '@ngx-translate/core'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { PLUGIN_MODAL_DATA } from '@/app/core/modal-data-tokens'
import { InterpolateMdPipe } from '@/app/core/pipes/interpolate-md.pipe'
import { ManagePluginsService } from '@/app/core/plugins/manage-plugins.service'
import { ManualConfigComponent } from '@/app/core/plugins/manual-config/manual-config.component'
import { PluginConfigComponent } from '@/app/core/plugins/plugin-config/plugin-config.component'
import { ChildBridgesService } from '@/app/core/utilities/child-bridges.service'
import { MobileDetectService } from '@/app/core/utilities/mobile-detect.service'
import { activeModalStub, fakeApi, makeChildBridge, makePlugin, makeSettings, toastrStub } from '@/testing'
import { provideFakes, provideTestTranslate } from '@/testing/providers'

/**
 * The two ways to edit a plugin's config: the generated form, and the raw JSON
 * editor for plugins that ship no schema.
 *
 * Both write the same thing to the same endpoint, so they share the rules that
 * matter: a config block always carries the plugin's alias under the right key,
 * a first-time save may offer a child bridge, and the save response says which
 * bridges need restarting. The JSON editor additionally has to cope with what
 * users paste into it, which is usually an example copied out of a README
 * complete with its surrounding `platforms` array.
 */
describe('plugin config modals', () => {
  let api: FakeApi
  let settings: FakeSettings
  let toastr: ReturnType<typeof toastrStub>
  let activeModal: ReturnType<typeof activeModalStub>
  let childBridges: { openCorrectRestartModalWithBridges: ReturnType<typeof vi.fn>, invalidate: ReturnType<typeof vi.fn> }
  let managePlugins: { bridgeSettings: ReturnType<typeof vi.fn> }
  let isMobile: boolean
  let navigate: ReturnType<typeof vi.fn>

  const schema = {
    pluginAlias: 'TestPlatform',
    pluginType: 'platform',
    strictValidation: false,
    schema: { type: 'object', properties: {} as Record<string, any> },
  }

  /**
   * Build one of the two modals.
   *
   * The children are replaced wholesale: the generated form and the Monaco
   * editor are each a subsystem of their own, and neither is what these specs
   * are about.
   * @param type - the modal component
   * @param data - overrides for the plugin modal data
   * @param arrange - registers responses on the freshly built fakes
   * @param render - whether to render the template; false for a case where the
   * modal dismisses itself on init, since the stub activeModal does not tear the
   * view down the way the real one does
   */
  async function open<T>(
    type: new (...args: any[]) => T,
    data: Record<string, any> = {},
    arrange?: () => void,
    render = true,
  ): Promise<T> {
    TestBed.resetTestingModule()
    api = fakeApi()
    settings = makeSettings()
    toastr = toastrStub()
    activeModal = activeModalStub()
    childBridges = { openCorrectRestartModalWithBridges: vi.fn(), invalidate: vi.fn() }
    managePlugins = { bridgeSettings: vi.fn(async () => undefined) }

    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideTestTranslate(),
        provideFakes({ api, settings, toastr, activeModal }),
        { provide: ChildBridgesService, useValue: childBridges },
        { provide: ManagePluginsService, useValue: managePlugins },
        { provide: MobileDetectService, useValue: { detect: { mobile: () => isMobile } } },
        {
          provide: PLUGIN_MODAL_DATA,
          useValue: { plugin: makePlugin(), schema: structuredClone(schema), ...data },
        },
      ],
    })

    TestBed.overrideComponent(type as any, {
      set: { imports: [TranslatePipe, InterpolateMdPipe], schemas: [NO_ERRORS_SCHEMA] },
    })

    navigate = vi.fn(async () => true)
    vi.spyOn(TestBed.inject(Router), 'navigate').mockImplementation(navigate as any)

    arrange?.()

    const fixture = TestBed.createComponent(type as any)
    if (render) {
      fixture.detectChanges()
      await fixture.whenStable()
    } else {
      ;(fixture.componentInstance as any).ngOnInit()
    }

    for (let tick = 0; tick < 10; tick += 1) {
      await Promise.resolve()
    }

    return fixture.componentInstance as T
  }

  beforeEach(() => {
    isMobile = false
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('the generated settings form', () => {
    /**
     * Build the form modal for a plugin.
     * @param config - the config blocks already saved for the plugin
     * @param data - overrides for the plugin modal data
     */
    function openForm(config: any[] = [], data: Record<string, any> = {}) {
      return open(PluginConfigComponent, data, () => {
        api.respond('get', '/config-editor/plugin/homebridge-test', config)
        // The server answers with the config it wrote, which is what the
        // first-save child bridge check reads
        api.respond('post', /^\/config-editor\/plugin\//, (call: any) => ({ config: call.body, affectedBridges: [] }))
      })
    }

    it('turns each saved block into an editable panel', async () => {
      const modal = await openForm([
        { platform: 'TestPlatform', name: 'Kitchen' },
        { platform: 'TestPlatform', name: 'Garage' },
      ])

      expect(modal.pluginConfig().map(block => block.name)).toEqual(['Kitchen', 'Garage'])
      // Each panel needs a stable id of its own, because validity is tracked
      // against it and the blocks can be reordered or removed
      expect(new Set(modal.pluginConfig().map(block => block.__uuid__)).size).toBe(2)
    })

    it('opens the first panel so the user sees something', async () => {
      const modal = await openForm([{ platform: 'TestPlatform', name: 'Kitchen' }])

      expect(modal.show()).toBe(modal.pluginConfig()[0].__uuid__)
    })

    it('falls back to the plugin alias when a block has no name', async () => {
      const modal = await openForm([{ platform: 'TestPlatform' }])

      expect(modal.pluginConfig()[0].name).toBe('TestPlatform')
    })

    it('starts a first block for a plugin with no config yet', async () => {
      const modal = await openForm([])

      expect(modal.isFirstSave()).toBe(true)
      expect(modal.pluginConfig()).toHaveLength(1)
      // The alias has to be in the block from the start, or Homebridge cannot
      // tell which plugin the block belongs to
      expect(modal.pluginConfig()[0].config).toEqual({ platform: 'TestPlatform' })
    })

    it('uses the accessory key for an accessory plugin', async () => {
      const modal = await openForm([], {
        schema: { ...schema, pluginType: 'accessory' },
      })

      expect(modal.pluginConfig()[0].config).toEqual({ accessory: 'TestPlatform' })
    })

    it('treats a new block as invalid until the form says otherwise', async () => {
      const modal = await openForm([{ platform: 'TestPlatform', name: 'Kitchen' }])

      modal.addBlock()

      // An empty block is usually missing something required, so assuming it is
      // fine would let the user save a broken config
      const added = modal.pluginConfig().at(-1)!
      expect(modal.formBlocksValid()[added.__uuid__]).toBe(false)
    })

    it('tracks validity against the block, not its position', async () => {
      const modal = await openForm([
        { platform: 'TestPlatform', name: 'First' },
        { platform: 'TestPlatform', name: 'Second' },
        { platform: 'TestPlatform', name: 'Third' },
      ])
      const [first, second, third] = modal.pluginConfig()
      modal.onIsValid(true, first.__uuid__)
      modal.onIsValid(false, second.__uuid__)
      modal.onIsValid(true, third.__uuid__)

      modal.removeBlock(second.__uuid__)

      // Removing the invalid middle block leaves the other two valid. Keyed by
      // index this shifted, so the third block inherited the second's state
      expect(modal.formIsValid()).toBe(true)
      expect(modal.formBlocksValid()[third.__uuid__]).toBe(true)
    })

    it('blocks the save while any block is invalid', async () => {
      const modal = await openForm([{ platform: 'TestPlatform', name: 'Kitchen' }])
      const [block] = modal.pluginConfig()

      modal.onIsValid(false, block.__uuid__)

      expect(modal.formIsValid()).toBe(false)
    })

    it('renames a panel from the name the user typed', async () => {
      const modal = await openForm([{ platform: 'TestPlatform', name: 'Kitchen' }])
      const [block] = modal.pluginConfig()
      block.config.name = 'Kitchen Lights'

      modal.blockShown(block.__uuid__)

      // The panel headings are how the user tells several blocks apart, so they
      // follow the name field rather than being fixed at load time
      expect(modal.pluginConfig()[0].name).toBe('Kitchen Lights')
    })

    it('closes the open panel when it is collapsed', async () => {
      const modal = await openForm([{ platform: 'TestPlatform', name: 'Kitchen' }])
      const [block] = modal.pluginConfig()

      modal.blockHidden(block.__uuid__)

      expect(modal.show()).toBe('')
    })

    it('saves the blocks and asks for the bridges that need restarting', async () => {
      const modal = await openForm([{ platform: 'TestPlatform', name: 'Kitchen' }], {})

      await modal.save()

      expect(api.lastCall('post', '/config-editor/plugin/homebridge-test?include=restart-info')?.body)
        .toEqual([{ platform: 'TestPlatform', name: 'Kitchen' }])
      expect(activeModal.close).toHaveBeenCalled()
      expect(childBridges.openCorrectRestartModalWithBridges).toHaveBeenCalled()
    })

    it('passes the affected bridges straight through from the save response', async () => {
      const affected = [makeChildBridge()]
      const modal = await open(PluginConfigComponent, {}, () => {
        api.respond('get', '/config-editor/plugin/homebridge-test', [{ platform: 'TestPlatform', name: 'Kitchen' }])
        api.respond('post', /^\/config-editor\/plugin\//, { config: [{ platform: 'TestPlatform' }], affectedBridges: affected })
      })

      await modal.save()

      // These arrive on the save response rather than a second request, so the
      // restart prompt appears without another round trip
      expect(childBridges.openCorrectRestartModalWithBridges).toHaveBeenCalledWith(affected)
    })

    it('offers a child bridge the first time a platform is configured', async () => {
      const modal = await open(PluginConfigComponent, {}, () => {
        api.respond('get', '/config-editor/plugin/homebridge-test', [])
        api.respond('post', /^\/config-editor\/plugin\//, { config: [{ platform: 'TestPlatform' }], affectedBridges: [] })
      })

      await modal.save()

      expect(managePlugins.bridgeSettings).toHaveBeenCalledWith(expect.objectContaining({ name: 'homebridge-test' }), true)
      // The bridge modal replaces the restart prompt rather than stacking on it
      expect(childBridges.openCorrectRestartModalWithBridges).not.toHaveBeenCalled()
    })

    it('does not offer a child bridge when the setting is off', async () => {
      const modal = await open(PluginConfigComponent, {}, () => {
        api.respond('get', '/config-editor/plugin/homebridge-test', [])
        api.respond('post', /^\/config-editor\/plugin\//, { config: [{ platform: 'TestPlatform' }], affectedBridges: [] })
        settings.env.recommendChildBridges = false
      })

      await modal.save()

      expect(managePlugins.bridgeSettings).not.toHaveBeenCalled()
      expect(childBridges.openCorrectRestartModalWithBridges).toHaveBeenCalled()
    })

    it('does not offer a child bridge on a later save', async () => {
      const modal = await openForm([{ platform: 'TestPlatform', name: 'Kitchen' }])

      await modal.save()

      expect(modal.isFirstSave()).toBe(false)
      expect(managePlugins.bridgeSettings).not.toHaveBeenCalled()
    })

    it('reloads its own settings when the ui config is saved', async () => {
      const modal = await open(PluginConfigComponent, { plugin: makePlugin({ name: 'homebridge-config-ui-x' }) }, () => {
        api.respond('get', '/config-editor/plugin/homebridge-config-ui-x', [{ platform: 'config' }])
        api.respond('post', /^\/config-editor\/plugin\//, { config: [{ platform: 'config' }], affectedBridges: [] })
      })

      await modal.save()

      // The UI is configuring itself, so the running page has to pick the new
      // values up rather than wait for a reload
      expect(settings.getAppSettings).toHaveBeenCalled()
      expect(managePlugins.bridgeSettings).not.toHaveBeenCalled()
    })

    it('stays open when the save fails', async () => {
      const modal = await open(PluginConfigComponent, {}, () => {
        api.respond('get', '/config-editor/plugin/homebridge-test', [{ platform: 'TestPlatform' }])
        api.fail('post', /^\/config-editor\/plugin\//, new Error('read only file system'))
      })

      await modal.save()

      expect(modal.saveInProgress()).toBe(false)
      expect(activeModal.close).not.toHaveBeenCalled()
      expect(toastr.at('error')[0].message).toBe('config.failed_to_save_config')
    })

    it('closes itself when it was opened without a schema', async () => {
      const modal = await open(PluginConfigComponent, { schema: null }, undefined, false)

      expect(activeModal.dismiss).toHaveBeenCalledWith('Missing required data')
      expect(modal.pluginConfig()).toEqual([])
    })

    it('reuses the config the editor already loaded', async () => {
      const modal = await open(PluginConfigComponent, {
        editorContext: { config: [{ platform: 'TestPlatform', name: 'From Editor' }] },
      })

      expect(api.callsTo('get')).toHaveLength(0)
      expect(modal.pluginConfig()[0].name).toBe('From Editor')
    })

    it('tells the user when the config cannot be read', async () => {
      const modal = await open(PluginConfigComponent, {}, () =>
        api.fail('get', '/config-editor/plugin/homebridge-test', { error: { message: 'config.json is not valid json' } }))

      // The server's own message is worth showing here: it names what is wrong
      // with the file
      expect(toastr.at('error')[0].message).toBe('config.json is not valid json')
      expect(modal.pluginConfig()).toEqual([])
    })

    it('describes the hue bridge users so the form can render them', async () => {
      const modal = await open(PluginConfigComponent, { plugin: makePlugin({ name: 'homebridge-hue' }) }, () =>
        api.respond('get', '/config-editor/plugin/homebridge-hue', [{
          platform: 'Hue',
          users: { '0017880ae670': 'abc123', '0017880ae671': 'def456' },
        }]))

      // homebridge-hue's schema declares no shape for its users map, so the
      // keys the user already has are added to it by hand
      expect(Object.keys(modal.schema.schema.properties.users.properties)).toEqual(['0017880ae670', '0017880ae671'])
    })

    it('copes with a hue config that has no users yet', async () => {
      const modal = await open(PluginConfigComponent, { plugin: makePlugin({ name: 'homebridge-hue' }) }, () =>
        api.respond('get', '/config-editor/plugin/homebridge-hue', [{ platform: 'Hue' }]))

      expect(modal.schema.schema.properties.users.properties).toEqual({})
    })
  })

  describe('the raw json editor', () => {
    let editorValue: string
    let markers: Array<{ severity: number }>

    /**
     * A stand-in for the Monaco editor.
     *
     * Only the model's value and the validation markers matter here; the editor
     * itself is a third-party component with its own tests.
     */
    function fakeEditor() {
      return {
        getModel: () => ({
          uri: { toString: () => 'inmemory://model/1' },
          getValue: () => editorValue,
          setValue: (value: string) => {
            editorValue = value
          },
        }),
        getAction: () => ({ run: vi.fn() }),
        onDidChangeModelContent: vi.fn(),
        dispose: vi.fn(),
      }
    }

    /**
     * Build the JSON editor modal with a fake editor already attached.
     * @param config - the config blocks already saved for the plugin
     * @param data - overrides for the plugin modal data
     */
    async function openEditor(config: any[] = [{ platform: 'TestPlatform', name: 'Kitchen' }], data: Record<string, any> = {}) {
      const modal = await open(ManualConfigComponent, data, () => {
        api.respond('get', '/plugins/alias/homebridge-test', { pluginAlias: 'TestPlatform', pluginType: data.pluginType ?? 'platform' })
        api.respond('get', '/config-editor/plugin/homebridge-test', config)
        // The server answers with the config it wrote, which is what the
        // first-save child bridge check reads
        api.respond('post', /^\/config-editor\/plugin\//, (call: any) => ({ config: call.body, affectedBridges: [] }))
      })
      modal.monacoEditor = fakeEditor()
      return modal
    }

    beforeEach(() => {
      editorValue = ''
      markers = []
      // Monaco is a global the component reads directly rather than injecting
      Object.defineProperty(window, 'monaco', {
        configurable: true,
        value: {
          MarkerSeverity: { Error: 8, Warning: 4 },
          editor: {
            getModelMarkers: () => markers,
            onDidChangeMarkers: vi.fn(),
          },
          languages: { json: { jsonDefaults: { diagnosticsOptions: { schemas: [] }, setDiagnosticsOptions: vi.fn() } } },
        },
      })
    })

    it('refuses to work on a phone', async () => {
      isMobile = true
      const modal = await open(ManualConfigComponent)

      // Monaco is unusable on a touch keyboard, and there is no fallback here -
      // the user is pointed at the full config editor instead
      expect(modal.canConfigure()).toBe(false)
      expect(modal.loading()).toBe(false)
      expect(api.callsTo('get')).toHaveLength(0)
    })

    it('loads the saved blocks and opens the first', async () => {
      const modal = await openEditor([
        { platform: 'TestPlatform', name: 'Kitchen' },
        { platform: 'TestPlatform', name: 'Garage' },
      ])

      expect(modal.canConfigure()).toBe(true)
      expect(modal.currentBlockIndex()).toBe(0)
      expect(JSON.parse(modal.currentBlock()!)).toEqual({ platform: 'TestPlatform', name: 'Kitchen' })
    })

    it('starts a block for a plugin with no config yet', async () => {
      const modal = await openEditor([])

      expect(modal.isFirstSave()).toBe(true)
      expect(modal.pluginConfig()).toEqual([{ platform: 'TestPlatform', name: 'TestPlatform' }])
    })

    it('gives up quietly when the plugin has no alias', async () => {
      const modal = await open(ManualConfigComponent, {}, () =>
        api.respond('get', '/plugins/alias/homebridge-test', {}))

      // Without an alias there is no way to know what key the block needs, so
      // there is nothing useful to show
      expect(modal.loading()).toBe(false)
      expect(modal.canConfigure()).toBe(false)
    })

    it('uses the platforms array key for a platform plugin', async () => {
      const modal = await openEditor()

      expect(modal.arrayKey()).toBe('platforms')
    })

    it('uses the accessories array key for an accessory plugin', async () => {
      const modal = await openEditor([{ accessory: 'TestPlatform', name: 'Lamp' }], { pluginType: 'accessory' })

      expect(modal.arrayKey()).toBe('accessories')
    })

    it('writes what the user typed back into the block', async () => {
      const modal = await openEditor()
      editorValue = '{ "platform": "TestPlatform", "name": "Kitchen", "lightbulbs": 3 }'

      await modal.save()

      expect(api.lastCall('post', /include=restart-info/)?.body).toEqual([
        { platform: 'TestPlatform', name: 'Kitchen', lightbulbs: 3 },
      ])
    })

    it('accepts json5, so trailing commas and comments are fine', async () => {
      const modal = await openEditor()
      editorValue = `{
        // the kitchen one
        "platform": "TestPlatform",
        "name": "Kitchen",
      }`

      await modal.save()

      // Users paste from READMEs and from their own config.json, which
      // Homebridge itself reads with comments allowed
      expect(api.lastCall('post', /include=restart-info/)?.body).toEqual([
        { platform: 'TestPlatform', name: 'Kitchen' },
      ])
    })

    it('unwraps an example pasted with its platforms array', async () => {
      const modal = await openEditor()
      editorValue = '{ "platforms": [{ "platform": "TestPlatform", "name": "From The Readme" }] }'

      await modal.save()

      // This is what a README shows, and pasting it verbatim is the single most
      // common thing users do here
      expect(api.lastCall('post', /include=restart-info/)?.body).toEqual([
        { platform: 'TestPlatform', name: 'From The Readme' },
      ])
    })

    it('leaves a wrapper alone when the block also has its own alias', async () => {
      const modal = await openEditor()
      editorValue = '{ "platform": "TestPlatform", "platforms": [{ "platform": "Other" }] }'

      // Only an object whose sole key is the array gets unwrapped, so a config
      // that genuinely has both keys is not mangled
      await modal.save()

      expect(api.lastCall('post', /include=restart-info/)?.body).toEqual([
        { platform: 'TestPlatform', platforms: [{ platform: 'Other' }] },
      ])
    })

    it('repairs a fragment pasted without its outer braces', async () => {
      const modal = await openEditor()
      editorValue = '"platform": "TestPlatform", "devices": ["one"]'

      await modal.save()

      expect(api.lastCall('post', /include=restart-info/)?.body).toEqual([
        { platform: 'TestPlatform', devices: ['one'] },
      ])
    })

    it('always puts the plugin alias back', async () => {
      const modal = await openEditor()
      editorValue = '{ "platform": "SomethingElse", "name": "Kitchen" }'

      await modal.save()

      // Editing the alias by hand would orphan the block: Homebridge would not
      // match it to any installed plugin
      expect(api.lastCall('post', /include=restart-info/)?.body).toEqual([
        { platform: 'TestPlatform', name: 'Kitchen' },
      ])
    })

    it('refuses to save invalid json', async () => {
      const modal = await openEditor()
      editorValue = '{ "platform": '

      await modal.save()

      expect(api.callsTo('post')).toHaveLength(0)
      expect(modal.saveInProgress()).toBe(false)
      expect(toastr.at('error')[0].message).toBe('config.config_invalid_json')
    })

    it('refuses to save an array', async () => {
      const modal = await openEditor()
      editorValue = '[{ "platform": "TestPlatform" }]'

      // The editor holds one block, not the whole list
      await modal.save()

      expect(api.callsTo('post')).toHaveLength(0)
      expect(toastr.at('error')[0].message).toBe('plugins.config.must_be_object')
    })

    it('insists an accessory block has a name', async () => {
      const modal = await openEditor([{ accessory: 'TestPlatform', name: 'Lamp' }], { pluginType: 'accessory' })
      editorValue = '{ "accessory": "TestPlatform" }'

      await modal.save()

      // Homebridge will not register an accessory without one, and adding the
      // empty key shows the user where it goes
      expect(api.callsTo('post')).toHaveLength(0)
      expect(toastr.at('error')[0].message).toBe('plugins.config.name_property')
      expect(JSON.parse(editorValue).name).toBe('')
    })

    it('adds a block only when the current one is valid json', async () => {
      const modal = await openEditor()
      editorValue = 'not json at all'

      modal.addBlock()

      // Otherwise moving to a new block would silently discard what the user
      // was part way through typing
      expect(modal.pluginConfig()).toHaveLength(1)
      expect(toastr.at('error')[0].message).toBe('config.config_invalid_json')
    })

    it('adds a block prefilled with the alias', async () => {
      const modal = await openEditor()
      editorValue = '{ "platform": "TestPlatform", "name": "Kitchen" }'

      modal.addBlock()

      expect(modal.pluginConfig()).toHaveLength(2)
      expect(modal.pluginConfig()[1]).toEqual({ platform: 'TestPlatform', name: 'TestPlatform' })
      expect(modal.currentBlockIndex()).toBe(1)
    })

    it('cancels its deferred validation when the modal closes', async () => {
      // ⚠️ Opening a block schedules a re-check for when Monaco has caught up. It
      // reads `window` and writes a signal on this component, so one still pending
      // when the modal closes runs against a component that no longer exists — and
      // in a test environment that has already been torn down, which surfaces as an
      // unhandled "window is not defined" attributed to no test at all
      vi.useFakeTimers()
      const modal = await openEditor([{ platform: 'TestPlatform', name: 'Kitchen' }])
      const validate = vi.spyOn(modal, 'onValidationChange')

      modal.addBlock()
      modal.ngOnDestroy()
      await vi.advanceTimersByTimeAsync(1000)

      expect(validate).not.toHaveBeenCalled()
      vi.useRealTimers()
    })

    it('runs the deferred validation while the modal is still open', async () => {
      // The guard on the case above: without this, a component that never
      // scheduled anything would pass it
      vi.useFakeTimers()
      const modal = await openEditor([{ platform: 'TestPlatform', name: 'Kitchen' }])
      const validate = vi.spyOn(modal, 'onValidationChange')

      modal.addBlock()
      await vi.advanceTimersByTimeAsync(1000)

      expect(validate).toHaveBeenCalled()
      vi.useRealTimers()
    })

    it('removes a block and closes the editor', async () => {
      const modal = await openEditor([
        { platform: 'TestPlatform', name: 'Kitchen' },
        { platform: 'TestPlatform', name: 'Garage' },
      ])

      modal.removeBlock(0)

      expect(modal.pluginConfig()).toEqual([{ platform: 'TestPlatform', name: 'Garage' }])
      // Nothing is being edited any more, so the editor must not keep showing
      // the block that was just deleted
      expect(modal.currentBlockIndex()).toBeNull()
      expect(modal.currentBlock()).toBeUndefined()
    })

    it('counts a schema error against the block being edited', async () => {
      const modal = await openEditor()
      markers = [{ severity: 8 }]

      modal.onValidationChange()

      expect(modal.formBlocksValid()[0]).toBe(false)
      expect(modal.formIsValid()).toBe(false)
    })

    it('counts a schema warning as invalid too', async () => {
      const modal = await openEditor()
      markers = [{ severity: 4 }]

      modal.onValidationChange()

      // A schema warning here means a property Homebridge will not understand
      expect(modal.formIsValid()).toBe(false)
    })

    it('ignores hints and information markers', async () => {
      const modal = await openEditor()
      markers = [{ severity: 1 }, { severity: 2 }]

      modal.onValidationChange()

      expect(modal.formIsValid()).toBe(true)
    })

    it('treats a block as valid when there is no editor yet', async () => {
      const modal = await open(ManualConfigComponent, {}, () => {
        api.respond('get', '/plugins/alias/homebridge-test', { pluginAlias: 'TestPlatform', pluginType: 'platform' })
        api.respond('get', '/config-editor/plugin/homebridge-test', [{ platform: 'TestPlatform' }])
      })

      // Monaco loads asynchronously, so the save button must not be disabled
      // while waiting for it
      expect(modal.isJsonValid()).toBe(true)
      expect(modal.formIsValid()).toBe(true)
    })

    it('sends the user to the full editor when asked', async () => {
      const modal = await openEditor()

      modal.openFullConfigEditor()

      expect(navigate).toHaveBeenCalledWith(['/config'])
      expect(activeModal.close).toHaveBeenCalled()
    })

    it('offers a child bridge the first time a platform is configured', async () => {
      const modal = await openEditor([])
      editorValue = '{ "platform": "TestPlatform", "name": "Kitchen" }'

      await modal.save()

      expect(managePlugins.bridgeSettings).toHaveBeenCalledWith(expect.objectContaining({ name: 'homebridge-test' }), true)
    })

    it('stays open when the save fails', async () => {
      const modal = await open(ManualConfigComponent, {}, () => {
        api.respond('get', '/plugins/alias/homebridge-test', { pluginAlias: 'TestPlatform', pluginType: 'platform' })
        api.respond('get', '/config-editor/plugin/homebridge-test', [{ platform: 'TestPlatform' }])
        api.fail('post', /^\/config-editor\/plugin\//, new Error('read only file system'))
      })
      modal.monacoEditor = fakeEditor()
      editorValue = '{ "platform": "TestPlatform" }'

      await modal.save()

      expect(modal.saveInProgress()).toBe(false)
      expect(toastr.at('error')[0].message).toBe('config.failed_to_save_config')
    })
  })
})

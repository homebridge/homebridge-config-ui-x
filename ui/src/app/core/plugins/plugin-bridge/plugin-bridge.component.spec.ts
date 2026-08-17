import type { FakeApi, FakeSettings } from '@/testing'

import { NO_ERRORS_SCHEMA } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { provideRouter, Router } from '@angular/router'
import { TranslatePipe } from '@ngx-translate/core'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { RestartHomebridgeComponent } from '@/app/core/components/restart-homebridge/restart-homebridge.component'
import { PLUGIN_BRIDGE_MODAL_DATA } from '@/app/core/modal-data-tokens'
import { InterpolateMdPipe } from '@/app/core/pipes/interpolate-md.pipe'
import { ManagePluginsService } from '@/app/core/plugins/manage-plugins.service'
import { PluginBridgeComponent } from '@/app/core/plugins/plugin-bridge/plugin-bridge.component'
import { ChildBridgesService } from '@/app/core/utilities/child-bridges.service'
import { activeModalStub, fakeApi, makePlugin, makeSettings, modalServiceSpy, toastrStub } from '@/testing'
import { provideFakes, provideTestTranslate } from '@/testing/providers'

/**
 * The child bridge modal - the largest component in the app, and the one whose
 * output Homebridge is fussiest about.
 *
 * Everything here ends up as a `_bridge` block in config.json, and a wrong shape
 * is not a cosmetic problem: Homebridge refuses to start a child bridge whose
 * name breaks HAP's naming rules, two bridges on one port silently fight, and
 * the "HAP disabled" flag has two different spellings depending on the running
 * Homebridge version.
 *
 * These specs cover the rules that decide what gets written, rather than the
 * modal's very large template.
 */
describe('pluginBridgeComponent', () => {
  let api: FakeApi
  let settings: FakeSettings
  let toastr: ReturnType<typeof toastrStub>
  let activeModal: ReturnType<typeof activeModalStub>
  let childBridges: Record<string, ReturnType<typeof vi.fn>>
  let navigate: ReturnType<typeof vi.fn>
  // Named `modalService` because the individual tests call the component
  // instance `modal`
  let modalService: ReturnType<typeof modalServiceSpy>
  let managePlugins: { bridgeSettings: ReturnType<typeof vi.fn>, settings: ReturnType<typeof vi.fn> }

  const schema = { pluginAlias: 'TestPlatform', pluginType: 'platform', schema: { type: 'object', properties: {} } }

  /**
   * Build the modal.
   * @param config - the plugin's saved config blocks
   * @param options - feature flags and modal data overrides
   * @param options.featureFlags - the settings feature flags to enable
   * @param options.pluginType - platform or accessory
   * @param options.data - overrides for the modal data
   * @param options.env - extra settings environment, for the saved bridge list
   * @param options.arrange - runs after the default responses are registered
   * but before the component is created
   */
  async function open(config: any[], options: {
    featureFlags?: Record<string, boolean>
    pluginType?: string
    data?: Record<string, any>
    env?: Record<string, any>
    arrange?: () => void
  } = {}): Promise<PluginBridgeComponent> {
    TestBed.resetTestingModule()
    api = fakeApi()
    settings = makeSettings({ env: { featureFlags: options.featureFlags ?? {}, ...options.env } })
    toastr = toastrStub()
    activeModal = activeModalStub()
    childBridges = { getAll: vi.fn(async () => []), invalidate: vi.fn(), openCorrectRestartModalWithBridges: vi.fn() }
    modalService = modalServiceSpy()
    managePlugins = { bridgeSettings: vi.fn(), settings: vi.fn() }

    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideTestTranslate(),
        provideFakes({ api, settings, toastr, activeModal, modal: modalService }),
        { provide: ChildBridgesService, useValue: childBridges },
        { provide: ManagePluginsService, useValue: managePlugins },
        {
          provide: PLUGIN_BRIDGE_MODAL_DATA,
          useValue: {
            plugin: makePlugin(),
            schema,
            editorContext: {
              alias: { pluginAlias: 'TestPlatform', pluginType: options.pluginType ?? 'platform' },
              config,
            },
            ...options.data,
          },
        },
      ],
    })

    // The template is enormous and full of bootstrap accordions and child
    // components; none of it is what these rules live in
    TestBed.overrideComponent(PluginBridgeComponent, {
      set: { imports: [TranslatePipe, InterpolateMdPipe], schemas: [NO_ERRORS_SCHEMA] },
    })

    navigate = vi.fn(async () => true)
    vi.spyOn(TestBed.inject(Router), 'navigate').mockImplementation(navigate as any)

    api.respond('get', '/server/port/new', { port: 51234 })
    api.respond('get', '/server/port/new/matter', { port: 5540 })
    api.respond('get', /^\/server\/pairings\//, { name: 'Test Bridge', paired: false })
    api.respond('get', '/config-editor/ui', { childBridges: [] })

    // ⚠️ After the default responses are registered but before the component is
    // created - the component fetches on init, so anything arranged after
    // creation is too late
    options.arrange?.()

    const fixture = TestBed.createComponent(PluginBridgeComponent)
    fixture.detectChanges()
    await fixture.whenStable()

    for (let tick = 0; tick < 15; tick += 1) {
      await Promise.resolve()
    }

    return fixture.componentInstance
  }

  /**
   * A checkbox change event, as the toggles receive.
   * @param checked - the new checkbox state
   */
  function checkboxEvent(checked: boolean): Event {
    return { target: { checked } } as unknown as Event
  }

  beforeEach(() => {
    // The generated username is random; pin it so the shape can be asserted
    vi.spyOn(Math, 'random').mockReturnValue(0.5)
  })

  describe('reading the saved config', () => {
    it('marks a block with a bridge as enabled', async () => {
      const modal = await open([
        { platform: 'TestPlatform', name: 'One', _bridge: { username: '0E:11:11:11:11:11', port: 51001 } },
        { platform: 'TestPlatform', name: 'Two' },
      ])

      expect(modal.enabledBlocks()).toEqual({ 0: true })
      expect(modal.isPlatform()).toBe(true)
    })

    it('treats hap as enabled unless the config says otherwise', async () => {
      const modal = await open([
        { platform: 'TestPlatform', _bridge: { username: '0E:11:11:11:11:11' } },
      ])

      expect(modal.hapEnabledBlocks()[0]).toBe(true)
    })

    it('reads the legacy boolean form of a disabled hap bridge', async () => {
      const modal = await open([
        { platform: 'TestPlatform', _bridge: { username: '0E:11:11:11:11:11', hap: false } },
      ])

      // What older Homebridge versions wrote, and what is still in plenty of
      // config files
      expect(modal.hapEnabledBlocks()[0]).toBe(false)
    })

    it('reads the nested object form of a disabled hap bridge', async () => {
      const modal = await open([
        { platform: 'TestPlatform', _bridge: { username: '0E:11:11:11:11:11', hap: { enabled: false } } },
      ])

      expect(modal.hapEnabledBlocks()[0]).toBe(false)
    })

    it('surfaces the externals-only flag when the runtime supports it', async () => {
      const modal = await open(
        [{ platform: 'TestPlatform', _bridge: { username: '0E:11:11:11:11:11', hap: { enabled: false, externalsOnly: true } } }],
        { featureFlags: { protocolExternalsOnly: true } },
      )

      expect(modal.hapExternalsOnlyBlocks()[0]).toBe(true)
    })

    it('ignores the externals-only flag when the runtime does not support it', async () => {
      const modal = await open(
        [{ platform: 'TestPlatform', _bridge: { username: '0E:11:11:11:11:11', hap: { enabled: false, externalsOnly: true } } }],
      )

      // Showing a toggle the running Homebridge would reject is worse than not
      // showing the setting at all
      expect(modal.hapExternalsOnlyBlocks()).toEqual({})
    })

    it('never reads an accessory bridge as having hap disabled', async () => {
      const modal = await open(
        [{ accessory: 'TestAccessory', _bridge: { username: '0E:11:11:11:11:11', hap: false } }],
        { pluginType: 'accessory' },
      )

      // An accessory has no Matter alternative, so a disabled HAP would leave it
      // unreachable - the setting is ignored rather than honoured
      expect(modal.hapEnabledBlocks()[0]).toBe(true)
    })

    it('closes itself when the plugin type cannot be read', async () => {
      TestBed.resetTestingModule()
      api = fakeApi()
      toastr = toastrStub()
      activeModal = activeModalStub()

      TestBed.configureTestingModule({
        providers: [
          provideRouter([]),
          provideTestTranslate(),
          provideFakes({ api, settings: makeSettings(), toastr, activeModal, modal: modalServiceSpy() }),
          { provide: ChildBridgesService, useValue: { getAll: vi.fn(async () => []), invalidate: vi.fn() } },
          { provide: ManagePluginsService, useValue: { bridgeSettings: vi.fn() } },
          {
            provide: PLUGIN_BRIDGE_MODAL_DATA,
            useValue: { plugin: makePlugin(), schema, editorContext: { config: [] } },
          },
        ],
      })
      TestBed.overrideComponent(PluginBridgeComponent, {
        set: { imports: [TranslatePipe, InterpolateMdPipe], schemas: [NO_ERRORS_SCHEMA] },
      })
      api.fail('get', /^\/plugins\/alias\//, new Error('offline'))

      const fixture = TestBed.createComponent(PluginBridgeComponent)
      fixture.detectChanges()
      await fixture.whenStable()
      for (let tick = 0; tick < 15; tick += 1) {
        await Promise.resolve()
      }

      // Without knowing whether this is a platform or an accessory, every rule
      // below is a guess
      expect(activeModal.close).toHaveBeenCalled()
    })
  })

  describe('the bridge name', () => {
    it('rejects a name that does not start with a letter or number', async () => {
      const modal = await open([
        { platform: 'TestPlatform', _bridge: { username: '0E:11:11:11:11:11', name: ' Kitchen' } },
      ])

      // HAP's own check, which Homebridge applies when it starts the bridge
      expect(modal.getHapNameValidationError('0')).toBe(true)
    })

    it('rejects a name containing punctuation', async () => {
      const modal = await open([
        { platform: 'TestPlatform', _bridge: { username: '0E:11:11:11:11:11', name: 'Kitchen - Lights' } },
      ])

      expect(modal.getHapNameValidationError('0')).toBe(true)
    })

    it('accepts letters, numbers, spaces and apostrophes', async () => {
      const modal = await open([
        { platform: 'TestPlatform', _bridge: { username: '0E:11:11:11:11:11', name: `Bob's Kitchen 2` } },
      ])

      expect(modal.getHapNameValidationError('0')).toBe(false)
    })

    it('treats an empty name as fine', async () => {
      const modal = await open([
        { platform: 'TestPlatform', _bridge: { username: '0E:11:11:11:11:11' } },
      ])

      // Homebridge falls back to the plugin name, so this is not an error
      expect(modal.getHapNameValidationError('0')).toBe(false)
    })

    it('cleans up the plugin name when generating one', async () => {
      const modal = await open([{ platform: 'TestPlatform' }], {
        data: { plugin: makePlugin({ displayName: '  Test - Plugin!  ' }) },
      })
      const block = modal.configBlocks()[0]

      await modal.toggleHapBridge(block, true, '0')

      // Plugin display names routinely contain dashes and brackets, none of
      // which HAP allows, so the generated name is sanitised rather than
      // failing validation the moment the modal opens
      expect(block._bridge.name).toBe('Test  Plugin')
      expect(modal.getHapNameValidationError('0')).toBe(false)
    })
  })

  describe('the hap port', () => {
    it('accepts an empty port', async () => {
      const modal = await open([
        { platform: 'TestPlatform', _bridge: { username: '0E:11:11:11:11:11' } },
      ])

      // Homebridge allocates one, which is the normal case
      expect(modal.getHapPortValidationError('0')).toBe(false)
    })

    it('rejects a port below the allowed range', async () => {
      const modal = await open([
        { platform: 'TestPlatform', _bridge: { username: '0E:11:11:11:11:11', port: 80 } },
      ])

      expect(modal.getHapPortValidationError('0')).toBe(true)
    })

    it('rejects a port above the allowed range', async () => {
      const modal = await open([
        { platform: 'TestPlatform', _bridge: { username: '0E:11:11:11:11:11', port: 65534 } },
      ])

      expect(modal.getHapPortValidationError('0')).toBe(true)
    })

    it('rejects a port two enabled bridges both want', async () => {
      const modal = await open([
        { platform: 'TestPlatform', name: 'One', _bridge: { username: '0E:11:11:11:11:11', port: 51001 } },
        { platform: 'TestPlatform', name: 'Two', _bridge: { username: '0E:22:22:22:22:22', port: 51001 } },
      ])

      // Two bridges on one port start, then fight, and the symptom is one of
      // them randomly going unresponsive
      expect(modal.getHapPortValidationError('0')).toBe(true)
      expect(modal.getHapPortValidationError('1')).toBe(true)
    })

    it('ignores a clash with a bridge that is switched off', async () => {
      const modal = await open([
        { platform: 'TestPlatform', name: 'One', _bridge: { username: '0E:11:11:11:11:11', port: 51001 } },
        { platform: 'TestPlatform', name: 'Two' },
      ])
      // A disabled block's old port is not in use, so it cannot conflict
      modal.configBlocks()[1]._bridge = { username: '0E:22:22:22:22:22', port: 51001 }

      expect(modal.getHapPortValidationError('0')).toBe(false)
    })

    it('rejects a hap port that clashes with matter on the same bridge', async () => {
      const modal = await open([
        {
          platform: 'TestPlatform',
          _bridge: { username: '0E:11:11:11:11:11', port: 5540, matter: { port: 5540 } },
        },
      ])

      expect(modal.getHapPortValidationError('0')).toBe(true)
    })
  })

  describe('the matter port', () => {
    it('accepts an empty port', async () => {
      const modal = await open(
        [{ platform: 'TestPlatform', _bridge: { username: '0E:11:11:11:11:11' } }],
        { featureFlags: { matterSupport: true } },
      )

      expect(modal.getMatterPortValidationError('0')).toBe(false)
    })

    it('rejects a privileged port', async () => {
      const modal = await open(
        [{ platform: 'TestPlatform', _bridge: { username: '0E:11:11:11:11:11', matter: { port: 443 } } }],
        { featureFlags: { matterSupport: true } },
      )

      expect(modal.getMatterPortValidationError('0')).toBe(true)
    })

    it('rejects the ports other services already own', async () => {
      for (const port of [5353, 8080, 8443]) {
        const modal = await open(
          [{ platform: 'TestPlatform', _bridge: { username: '0E:11:11:11:11:11', matter: { port } } }],
          { featureFlags: { matterSupport: true } },
        )

        // 5353 is mDNS, which Homebridge's own discovery needs; the other two
        // are the UI's usual ports
        expect(modal.getMatterPortValidationError('0')).toBe(true)
      }
    })

    it('rejects a matter port that clashes with hap on the same bridge', async () => {
      const modal = await open(
        [{ platform: 'TestPlatform', _bridge: { username: '0E:11:11:11:11:11', port: 5540, matter: { port: 5540 } } }],
        { featureFlags: { matterSupport: true } },
      )

      expect(modal.getMatterPortValidationError('0')).toBe(true)
    })
  })

  describe('naming the bridge that blocks the save', () => {
    it('reports no problem when everything is valid', async () => {
      const modal = await open([
        { platform: 'TestPlatform', name: 'One', _bridge: { username: '0E:11:11:11:11:11', name: 'Kitchen' } },
      ])

      expect(modal.hasValidationErrors).toBe(false)
      expect(modal.validationErrorBridgeName).toBeNull()
    })

    it('names the offending bridge even when it is not the one on screen', async () => {
      const modal = await open([
        { platform: 'TestPlatform', name: 'One', _bridge: { username: '0E:11:11:11:11:11', name: 'Kitchen' } },
        { platform: 'TestPlatform', name: 'Two', _bridge: { username: '0E:22:22:22:22:22', name: 'Bad - Name' } },
      ])

      // The save button is disabled with no explanation otherwise, and the user
      // is looking at a bridge that is perfectly fine (#2892)
      expect(modal.hasValidationErrors).toBe(true)
      expect(modal.validationErrorBridgeName).toBe('Bad - Name')
    })

    it('falls back through the names it has when the bridge is unnamed', async () => {
      const modal = await open([
        { platform: 'TestPlatform', name: 'Block Name', _bridge: { username: '0E:11:11:11:11:11', port: 80 } },
      ])

      expect(modal.validationErrorBridgeName).toBe('Block Name')
    })

    it('ignores a problem on a bridge that is switched off', async () => {
      const modal = await open([
        { platform: 'TestPlatform', name: 'One', _bridge: { username: '0E:11:11:11:11:11', name: 'Kitchen' } },
        { platform: 'TestPlatform', name: 'Two' },
      ])
      modal.configBlocks()[1]._bridge = { username: '0E:22:22:22:22:22', name: 'Bad - Name' }

      // Nothing is written for a disabled block, so its stale settings cannot
      // stop the save. Both the check and the message it drives have to agree,
      // or the save button is enabled while claiming a bridge is broken
      expect(modal.hasValidationErrors).toBe(false)
      expect(modal.validationErrorBridgeName).toBeNull()
    })
  })

  describe('switching hap off', () => {
    it('refuses on an accessory bridge', async () => {
      const modal = await open(
        [{ accessory: 'TestAccessory', _bridge: { username: '0E:11:11:11:11:11' } }],
        { pluginType: 'accessory' },
      )
      const block = modal.configBlocks()[0]
      const event = checkboxEvent(false)

      await modal.toggleHapBridge(block, false, '0', event)

      expect(modal.hapEnabledBlocks()[0]).toBe(true)
      // The checkbox is a one-way binding, so writing the same value back would
      // leave the tick where the browser put it
      expect((event.target as HTMLInputElement).checked).toBe(true)
      expect(toastr.at('error')[0].message).toBe('child_bridge.config.hap_disabled_for_accessory')
    })

    it('refuses when matter is not on to take over', async () => {
      const modal = await open(
        [{ platform: 'TestPlatform', _bridge: { username: '0E:11:11:11:11:11' } }],
        { featureFlags: { matterSupport: true } },
      )
      const block = modal.configBlocks()[0]
      const event = checkboxEvent(false)

      await modal.toggleHapBridge(block, false, '0', event)

      // Turning both protocols off would leave the accessories with no way to
      // be reached at all
      expect(modal.hapEnabledBlocks()[0]).toBe(true)
      expect((event.target as HTMLInputElement).checked).toBe(true)
      expect(toastr.at('info')[0].message).toBe('child_bridge.config.disable_hap_requires_matter')
    })

    it('allows it when the running homebridge supports no protocols at all', async () => {
      const modal = await open(
        [{ platform: 'TestPlatform', _bridge: { username: '0E:11:11:11:11:11' } }],
        { featureFlags: { matterSupport: true, disableAllProtocols: true } },
      )
      const block = modal.configBlocks()[0]

      await modal.toggleHapBridge(block, false, '0', checkboxEvent(false))

      expect(modal.hapEnabledBlocks()[0]).toBe(false)
    })

    it('writes the legacy boolean for an older homebridge', async () => {
      const modal = await open(
        [{ platform: 'TestPlatform', _bridge: { username: '0E:11:11:11:11:11' } }],
        { featureFlags: { disableAllProtocols: true } },
      )
      const block = modal.configBlocks()[0]

      await modal.toggleHapBridge(block, false, '0', checkboxEvent(false))

      expect(block._bridge.hap).toBe(false)
    })

    it('writes the nested object for a newer homebridge', async () => {
      const modal = await open(
        [{ platform: 'TestPlatform', _bridge: { username: '0E:11:11:11:11:11' } }],
        { featureFlags: { disableAllProtocols: true, protocolExternalsOnly: true } },
      )
      const block = modal.configBlocks()[0]

      await modal.toggleHapBridge(block, false, '0', checkboxEvent(false))

      // The two forms are not interchangeable: the newer runtime rejects the
      // boolean and the older one ignores the object
      expect(block._bridge.hap).toEqual({ enabled: false })
    })

    it('keeps the identifying-material preference across the switch', async () => {
      const modal = await open(
        [{
          platform: 'TestPlatform',
          _bridge: { username: '0E:11:11:11:11:11', hap: { disableIdentifyingMaterial: true } },
        }],
        { featureFlags: { disableAllProtocols: true, hapDisableIdentifyingMaterial: true } },
      )
      const block = modal.configBlocks()[0]

      await modal.toggleHapBridge(block, false, '0', checkboxEvent(false))

      // It is a separate preference from whether HAP is on, so switching HAP off
      // must not quietly discard it
      expect(block._bridge.hap).toEqual({ enabled: false, disableIdentifyingMaterial: true })
    })
  })

  describe('switching hap back on', () => {
    it('fills in the details a matter-only bridge is missing', async () => {
      const modal = await open([{ platform: 'TestPlatform' }])
      const block = modal.configBlocks()[0]

      await modal.toggleHapBridge(block, true, '0')

      expect(block._bridge.username).toMatch(/^0E(:[0-9A-F]{2}){5}$/)
      expect(block._bridge.port).toBe(51234)
      expect(block._bridge.name).toBe('Test Plugin')
    })

    it('falls back to a random port when the server cannot allocate one', async () => {
      const modal = await open([{ platform: 'TestPlatform' }])
      api.fail('get', '/server/port/new', new Error('offline'))
      const block = modal.configBlocks()[0]

      await modal.toggleHapBridge(block, true, '0')

      // A bridge with no port cannot start, so a guess in the usual range beats
      // leaving it blank
      expect(block._bridge.port).toBeGreaterThanOrEqual(30000)
      expect(block._bridge.port).toBeLessThanOrEqual(60000)
    })

    it('leaves a port the user already chose alone', async () => {
      const modal = await open([
        { platform: 'TestPlatform', _bridge: { username: '0E:11:11:11:11:11', port: 51999, hap: false } },
      ])
      const block = modal.configBlocks()[0]

      await modal.toggleHapBridge(block, true, '0')

      expect(block._bridge.port).toBe(51999)
      expect(block._bridge.username).toBe('0E:11:11:11:11:11')
    })

    it('clears the disabled flag entirely', async () => {
      const modal = await open([
        { platform: 'TestPlatform', _bridge: { username: '0E:11:11:11:11:11', hap: { enabled: false } } },
      ])
      const block = modal.configBlocks()[0]

      await modal.toggleHapBridge(block, true, '0')

      expect(block._bridge.hap).toBeUndefined()
    })

    it('clears a lingering externals-only setting', async () => {
      const modal = await open(
        [{
          platform: 'TestPlatform',
          _bridge: { username: '0E:11:11:11:11:11', hap: { enabled: false, externalsOnly: true } },
        }],
        { featureFlags: { protocolExternalsOnly: true } },
      )
      const block = modal.configBlocks()[0]

      await modal.toggleHapBridge(block, true, '0')

      // The newer runtime's rule is that externalsOnly requires enabled: false,
      // so leaving it behind makes the whole block invalid
      expect(modal.hapExternalsOnlyBlocks()[0]).toBe(false)
      expect(block._bridge.hap).toBeUndefined()
    })

    it('keeps the identifying-material preference', async () => {
      const modal = await open(
        [{
          platform: 'TestPlatform',
          _bridge: { username: '0E:11:11:11:11:11', hap: { enabled: false, disableIdentifyingMaterial: true } },
        }],
        { featureFlags: { hapDisableIdentifyingMaterial: true } },
      )
      const block = modal.configBlocks()[0]

      await modal.toggleHapBridge(block, true, '0')

      expect(block._bridge.hap).toEqual({ disableIdentifyingMaterial: true })
    })
  })

  describe('the externals-only toggle', () => {
    it('writes the flag alongside the disabled state', async () => {
      const modal = await open(
        [{ platform: 'TestPlatform', _bridge: { username: '0E:11:11:11:11:11', hap: { enabled: false } } }],
        { featureFlags: { protocolExternalsOnly: true } },
      )

      modal.toggleHapExternalsOnly(checkboxEvent(true), 0)

      expect(modal.configBlocks()[0]._bridge.hap).toEqual({ enabled: false, externalsOnly: true })
    })

    it('removes the flag rather than writing false', async () => {
      const modal = await open(
        [{
          platform: 'TestPlatform',
          _bridge: { username: '0E:11:11:11:11:11', hap: { enabled: false, externalsOnly: true } },
        }],
        { featureFlags: { protocolExternalsOnly: true } },
      )

      modal.toggleHapExternalsOnly(checkboxEvent(false), 0)

      // Homebridge treats absence and false the same way, and the config stays
      // readable without keys set to their defaults
      expect(modal.configBlocks()[0]._bridge.hap).toEqual({ enabled: false })
    })

    it('does nothing while hap is still enabled', async () => {
      const modal = await open(
        [{ platform: 'TestPlatform', _bridge: { username: '0E:11:11:11:11:11' } }],
        { featureFlags: { protocolExternalsOnly: true } },
      )

      modal.toggleHapExternalsOnly(checkboxEvent(true), 0)

      // The combination is invalid, and the toggle is hidden in this state
      expect(modal.configBlocks()[0]._bridge.hap).toBeUndefined()
    })

    it('does nothing at all when the runtime does not support it', async () => {
      const modal = await open([
        { platform: 'TestPlatform', _bridge: { username: '0E:11:11:11:11:11', hap: false } },
      ])

      modal.toggleHapExternalsOnly(checkboxEvent(true), 0)

      expect(modal.hapExternalsOnlyBlocks()).toEqual({})
      expect(modal.configBlocks()[0]._bridge.hap).toBe(false)
    })
  })

  describe('hiding the unpairing warning', () => {
    it('reports nothing hidden for a bridge with no saved preference', async () => {
      const modal = await open([
        { platform: 'TestPlatform', _bridge: { username: '0E:11:11:11:11:11' } },
      ])

      expect(modal.isUnpairingHidden('0E:11:11:11:11:11', 'hap')).toBe(false)
    })

    it('remembers the choice per protocol', async () => {
      const modal = await open([
        { platform: 'TestPlatform', _bridge: { username: '0E:11:11:11:11:11' } },
      ])

      modal.toggleHideUnpairing('0E:11:11:11:11:11', 'hap')

      // HAP and Matter each have their own warning, so hiding one must not hide
      // the other
      expect(modal.isUnpairingHidden('0E:11:11:11:11:11', 'hap')).toBe(true)
      expect(modal.isUnpairingHidden('0E:11:11:11:11:11', 'matter')).toBe(false)
    })

    it('matches the bridge id whatever case it is written in', async () => {
      const modal = await open([
        { platform: 'TestPlatform', _bridge: { username: '0E:11:11:11:11:11' } },
      ])

      modal.toggleHideUnpairing('0e:11:11:11:11:11', 'hap')

      // The id is a MAC address that appears in the config in either case
      expect(modal.isUnpairingHidden('0E:11:11:11:11:11', 'hap')).toBe(true)
    })

    it('switches the choice back off again', async () => {
      const modal = await open([
        { platform: 'TestPlatform', _bridge: { username: '0E:11:11:11:11:11' } },
      ])

      modal.toggleHideUnpairing('0E:11:11:11:11:11', 'hap')
      modal.toggleHideUnpairing('0E:11:11:11:11:11', 'hap')

      expect(modal.isUnpairingHidden('0E:11:11:11:11:11', 'hap')).toBe(false)
    })
  })

  describe('naming a matter fabric', () => {
    it('names the controllers it recognises', async () => {
      const modal = await open([{ platform: 'TestPlatform' }], { featureFlags: { matterSupport: true } })

      expect(modal.getMatterFabricLabel({ vendorId: 0x1349 })).toBe('Apple Home')
      expect(modal.getMatterFabricLabel({ vendorId: 0x6006 })).toBe('Google Home')
      expect(modal.getMatterFabricLabel({ vendorId: 0x1217 })).toBe('Amazon Alexa')
    })

    it('reads the raw field name the child bridge metadata uses', async () => {
      const modal = await open([{ platform: 'TestPlatform' }], { featureFlags: { matterSupport: true } })

      // Two paths supply this: one maps the field to vendorId, the other passes
      // matter.js's own rootVendorId straight through
      expect(modal.getMatterFabricLabel({ rootVendorId: 0x1349 })).toBe('Apple Home')
    })

    it('adds the home name when the fabric carries one', async () => {
      const modal = await open([{ platform: 'TestPlatform' }], { featureFlags: { matterSupport: true } })

      expect(modal.getMatterFabricLabel({ vendorId: 0x1349, label: 'Our House' })).toBe('Apple Home · Our House')
    })

    it('shows the raw id for a controller it does not know', async () => {
      const modal = await open([{ platform: 'TestPlatform' }], { featureFlags: { matterSupport: true } })

      expect(modal.getMatterFabricLabel({ vendorId: 0xABCD })).toBe('0xABCD')
      expect(modal.getMatterFabricLabel({})).toBe('0x0')
    })
  })

  describe('leaving the modal', () => {
    it('sends the user to the full config editor', async () => {
      const modal = await open([{ platform: 'TestPlatform' }])

      modal.openFullConfigEditor()

      expect(navigate).toHaveBeenCalledWith(['/config'])
      expect(activeModal.close).toHaveBeenCalled()
    })

    it('dismisses without saving', async () => {
      const modal = await open([{ platform: 'TestPlatform' }])

      modal.dismissModal()

      expect(activeModal.dismiss).toHaveBeenCalledWith('Dismiss')
    })
  })

  /**
   * These four blocks cover what the original spec deliberately left out: the
   * ~230-line `save()`, the Matter toggle, deletion of a paired bridge, and the
   * accessory link picker.
   *
   * `save()` is where every rule above turns into bytes on disk, so the point of
   * these is not the individual rules again but the ORDER and the SIDE EFFECTS:
   * what gets refused before anything is written, what gets deleted afterwards,
   * and which of the three exits the modal takes.
   */
  describe('switching matter off and on', () => {
    /** A platform block with both protocols already configured. */
    function matterBlock(overrides: Record<string, any> = {}) {
      return {
        platform: 'TestPlatform',
        _bridge: {
          username: '0E:11:11:11:11:11',
          port: 51001,
          name: 'Test Bridge',
          env: {},
          matter: { port: 5541 },
          ...overrides,
        },
      }
    }

    it('refuses on an accessory block, because matter is platform-only', async () => {
      const modal = await open([{ accessory: 'TestAccessory', _bridge: { username: '0E:11:11:11:11:11', port: 51001 } }], { pluginType: 'accessory' })
      const block = modal.configBlocks()[0]

      await modal.toggleMatterBridge(block, true, '0')

      expect(modal.matterEnabledBlocks()[0]).toBe(false)
      expect(block._bridge.matter).toBeUndefined()
    })

    it('refuses to switch matter off when hap is not on to take over', async () => {
      const modal = await open([matterBlock()])
      modal.hapEnabledBlocks.set({ 0: false })

      await modal.toggleMatterBridge(modal.configBlocks()[0], false, '0')

      expect(modal.matterEnabledBlocks()[0]).toBe(true)
      expect(toastr.info).toHaveBeenCalledWith('child_bridge.config.disable_matter_requires_hap', 'toast.title_notice')
    })

    it('allows it when the running homebridge supports no protocols at all', async () => {
      const modal = await open([matterBlock()], { featureFlags: { disableAllProtocols: true } })
      modal.hapEnabledBlocks.set({ 0: false })

      await modal.toggleMatterBridge(modal.configBlocks()[0], false, '0')

      expect(modal.matterEnabledBlocks()[0]).toBe(false)
      expect(toastr.info).not.toHaveBeenCalled()
    })

    it('allocates a matter port the first time it is switched on', async () => {
      const modal = await open([{ platform: 'TestPlatform', _bridge: { username: '0E:11:11:11:11:11', port: 51001, env: {} } }])

      await modal.toggleMatterBridge(modal.configBlocks()[0], true, '0')

      expect(modal.configBlocks()[0]._bridge.matter).toEqual({ port: 5540 })
    })

    it('builds a bridge block for a matter-only plugin that has none', async () => {
      const modal = await open([{ platform: 'TestPlatform' }])

      await modal.toggleMatterBridge(modal.configBlocks()[0], true, '0')

      expect(modal.configBlocks()[0]._bridge).toEqual({ env: {}, matter: { port: 5540 } })
    })

    it('keeps the commissioning by marking it disabled in place on a newer homebridge', async () => {
      // Tearing the block out would force the user to re-pair from scratch
      const modal = await open([matterBlock()], { featureFlags: { matterDisableInPlace: true } })
      modal.hapEnabledBlocks.set({ 0: true })

      await modal.toggleMatterBridge(modal.configBlocks()[0], false, '0')

      expect(modal.configBlocks()[0]._bridge.matter).toEqual({ port: 5541, enabled: false })
      expect(modal.deleteMatterBridges()).toEqual([])
    })

    it('tears the block out on an older homebridge', async () => {
      const modal = await open([matterBlock()])
      modal.hapEnabledBlocks.set({ 0: true })

      await modal.toggleMatterBridge(modal.configBlocks()[0], false, '0')

      expect(modal.configBlocks()[0]._bridge.matter).toBeUndefined()
    })

    it('restores the port it had rather than allocating a new one', async () => {
      const modal = await open([matterBlock()])
      modal.hapEnabledBlocks.set({ 0: true })

      await modal.toggleMatterBridge(modal.configBlocks()[0], false, '0')
      await modal.toggleMatterBridge(modal.configBlocks()[0], true, '0')

      expect(modal.configBlocks()[0]._bridge.matter.port).toBe(5541)
    })

    it('carries the ipv4 preference across a disable and re-enable', async () => {
      const modal = await open([matterBlock({ matter: { port: 5541, disableIpv4: true } })], {
        featureFlags: { matterDisableIpv4: true },
      })
      modal.hapEnabledBlocks.set({ 0: true })

      await modal.toggleMatterBridge(modal.configBlocks()[0], false, '0')
      await modal.toggleMatterBridge(modal.configBlocks()[0], true, '0')

      expect(modal.configBlocks()[0]._bridge.matter).toEqual({ port: 5541, disableIpv4: true })
      expect(modal.matterDisableIpv4Blocks()[0]).toBe(true)
    })

    it('clears a lingering externals-only flag when matter comes back on', async () => {
      // The runtime rejects `enabled: true` together with `externalsOnly: true`
      const modal = await open([matterBlock({ matter: { port: 5541, externalsOnly: true } })], {
        featureFlags: { protocolExternalsOnly: true },
      })

      await modal.toggleMatterBridge(modal.configBlocks()[0], true, '0')

      expect(modal.configBlocks()[0]._bridge.matter.externalsOnly).toBeUndefined()
      expect(modal.matterExternalsOnlyBlocks()[0]).toBe(false)
    })
  })

  describe('deleting the bridges a block no longer uses', () => {
    /** A block whose bridge the server already knows about. */
    function existingBridge(overrides: Record<string, any> = {}) {
      return {
        platform: 'TestPlatform',
        _bridge: { username: '0E:11:11:11:11:11', port: 51001, name: 'Test Bridge', env: {}, ...overrides },
      }
    }

    it('queues an orphaned bridge for deletion when the child bridge is switched off', async () => {
      // Otherwise the pairing record is left behind for a bridge nothing uses
      const modal = await open([existingBridge()], {
        arrange: () => api.respond('get', /^\/server\/pairings\//, { name: 'Test Bridge', _isPaired: false }),
      })

      await modal.toggleExternalBridge(modal.configBlocks()[0], false, '0')

      expect(modal.deleteBridges()).toEqual([
        { id: '0E:11:11:11:11:11', bridgeName: 'Test Bridge', paired: false },
      ])
      expect(modal.configBlocks()[0]._bridge).toBeUndefined()
    })

    it('flags that a paired bridge is about to go, so the user can be warned', async () => {
      const modal = await open([existingBridge()], {
        arrange: () => api.respond('get', /^\/server\/pairings\//, { name: 'Test Bridge', _isPaired: true }),
      })

      await modal.toggleExternalBridge(modal.configBlocks()[0], false, '0')

      expect(modal.deleteBridges()[0].paired).toBe(true)
      expect(modal.deletingPairedBridge()).toBe(true)
    })

    it('takes the bridge back off the deletion list when it is switched on again', async () => {
      const modal = await open([existingBridge()])
      await modal.toggleExternalBridge(modal.configBlocks()[0], false, '0')

      await modal.toggleExternalBridge(modal.configBlocks()[0], true, '0')

      expect(modal.deleteBridges()).toEqual([])
      expect(modal.deletingPairedBridge()).toBe(false)
    })

    it('queues it only once across an off, on, off cycle', async () => {
      const modal = await open([existingBridge()])

      await modal.toggleExternalBridge(modal.configBlocks()[0], false, '0')
      await modal.toggleExternalBridge(modal.configBlocks()[0], true, '0')
      await modal.toggleExternalBridge(modal.configBlocks()[0], false, '0')

      expect(modal.deleteBridges()).toHaveLength(1)
    })

    it('does not queue a bridge the server never had', async () => {
      // A bridge created and then switched off again in the same sitting has
      // nothing on disk to clean up
      const modal = await open([{ platform: 'TestPlatform' }])
      await modal.toggleExternalBridge(modal.configBlocks()[0], true, '0')

      await modal.toggleExternalBridge(modal.configBlocks()[0], false, '0')

      expect(modal.deleteBridges()).toEqual([])
    })
  })

  describe('linking an accessory block to a bridge it shares', () => {
    /** Two accessory blocks, the first with a bridge the second can share. */
    function twoAccessories() {
      return [
        { accessory: 'TestAccessory', name: 'First', _bridge: { username: '0E:11:11:11:11:11', port: 51001, name: 'Shared Bridge', env: {} } },
        { accessory: 'TestAccessory', name: 'Second' },
      ]
    }

    it('reads two accessories on one bridge as a link, not two bridges', async () => {
      // ⚠️ Accessory blocks can share a child bridge by repeating its username.
      // Read as two bridges they would both claim the same port, and only one of
      // them would ever publish
      const modal = await open([
        { accessory: 'TestAccessory', name: 'First', _bridge: { username: '0E:11:11:11:11:11', port: 51001, name: 'Shared Bridge', env: {} } },
        { accessory: 'TestAccessory', name: 'Second', _bridge: { username: '0E:11:11:11:11:11', port: 51001, name: 'Shared Bridge' } },
      ], { pluginType: 'accessory' })

      expect(modal.accessoryBridgeLinks()).toEqual([
        expect.objectContaining({ index: '1', usesIndex: '0', username: '0E:11:11:11:11:11' }),
      ])
      expect(modal.originalBridges()).toHaveLength(1)
    })

    it('gives the linked block no environment of its own', async () => {
      // ⚠️ The bridge is one process, so a second set of variables on the follower
      // would be written to the config and silently ignored
      const modal = await open([
        { accessory: 'TestAccessory', name: 'First', _bridge: { username: '0E:11:11:11:11:11', port: 51001, name: 'Shared Bridge', env: { DEBUG: 'a' } } },
        { accessory: 'TestAccessory', name: 'Second', _bridge: { username: '0E:11:11:11:11:11', port: 51001, env: { DEBUG: 'b' } } },
      ], { pluginType: 'accessory' })

      expect(modal.configBlocks()[1]._bridge.env).toEqual({})
    })

    it('strips a matter block from an accessory, because matter is platform-only', async () => {
      // ⚠️ Left in place it would be written back on save, and homebridge would
      // try to publish a matter bridge for something that cannot have one
      const modal = await open([
        { accessory: 'TestAccessory', name: 'First', _bridge: { username: '0E:11:11:11:11:11', port: 51001, env: {}, matter: { port: 5551 } } },
      ], { pluginType: 'accessory', featureFlags: { matterSupport: true } })

      expect(modal.configBlocks()[0]._bridge.matter).toBeUndefined()
    })

    it('offers only the earlier accessory bridges', async () => {
      // A block can only join a bridge defined above it in the config
      const modal = await open(twoAccessories(), { pluginType: 'accessory' })

      modal.onBlockChange('1')

      expect(modal.bridgesAvailableForLink().map(bridge => bridge.username)).toEqual(['0E:11:11:11:11:11'])
    })

    it('offers nothing to the first block', async () => {
      const modal = await open(twoAccessories(), { pluginType: 'accessory' })

      modal.onBlockChange('0')

      expect(modal.bridgesAvailableForLink()).toEqual([])
    })

    it('offers nothing on a platform block', async () => {
      const modal = await open([
        { platform: 'TestPlatform', _bridge: { username: '0E:11:11:11:11:11', port: 51001, env: {} } },
        { platform: 'TestPlatform' },
      ])

      modal.onBlockChange('1')

      expect(modal.bridgesAvailableForLink()).toEqual([])
    })

    it('does not offer a bridge that is about to be deleted', async () => {
      const modal = await open(twoAccessories(), { pluginType: 'accessory' })
      await modal.toggleExternalBridge(modal.configBlocks()[0], false, '0')

      modal.onBlockChange('1')

      expect(modal.bridgesAvailableForLink()).toEqual([])
    })

    it('points the block at the shared bridge and marks hap on', async () => {
      // Linked accessory blocks always ride HAP on the shared bridge, so
      // without this the save-time at-least-one-protocol guard rejects them
      const modal = await open(twoAccessories(), { pluginType: 'accessory' })
      modal.onBlockChange('1')

      modal.onLinkBridgeChange('0E:11:11:11:11:11')

      expect(modal.configBlocks()[1]._bridge).toEqual({ username: '0E:11:11:11:11:11' })
      expect(modal.enabledBlocks()[1]).toBe(true)
      expect(modal.hapEnabledBlocks()[1]).toBe(true)
      expect(modal.currentlySelectedLink()?.username).toBe('0E:11:11:11:11:11')
    })

    it('drops the link rather than queueing a deletion when the block is switched off', async () => {
      // The bridge still belongs to the block above, so deleting it would take
      // that one down too
      const modal = await open(twoAccessories(), { pluginType: 'accessory' })
      modal.onBlockChange('1')
      modal.onLinkBridgeChange('0E:11:11:11:11:11')

      await modal.toggleExternalBridge(modal.configBlocks()[1], false, '1')

      expect(modal.accessoryBridgeLinks()).toEqual([])
      expect(modal.deleteBridges()).toEqual([])
      expect(modal.currentlySelectedLink()).toBeNull()
    })
  })

  describe('saving', () => {
    function bridgeBlock(overrides: Record<string, any> = {}) {
      return {
        platform: 'TestPlatform',
        _bridge: { username: '0E:11:11:11:11:11', port: 51001, name: 'Test Bridge', env: {}, ...overrides },
      }
    }

    async function save(modal: PluginBridgeComponent) {
      await modal.save()
      for (let tick = 0; tick < 10; tick += 1) {
        await Promise.resolve()
      }
    }

    describe('what it refuses to write', () => {
      it('refuses a bridge with no protocol at all', async () => {
        const modal = await open([bridgeBlock()])
        modal.hapEnabledBlocks.set({ 0: false })
        modal.matterEnabledBlocks.set({ 0: false })

        await save(modal)

        expect(api.callsTo('post')).toEqual([])
        expect(toastr.error).toHaveBeenCalledWith('child_bridge.config.at_least_one_protocol', 'toast.title_error')
        expect(modal.saveInProgress()).toBe(false)
      })

      it('allows no protocol at all on a homebridge that supports it', async () => {
        const modal = await open([bridgeBlock()], { featureFlags: { disableAllProtocols: true } })
        modal.hapEnabledBlocks.set({ 0: false })
        modal.matterEnabledBlocks.set({ 0: false })

        await save(modal)

        expect(api.callsTo('post', /config-editor\/plugin/)).toHaveLength(1)
      })

      it('treats an accessory block as having hap on even when nothing set the flag', async () => {
        // A linked accessory block never gets its own hap flag set
        const modal = await open([{ accessory: 'TestAccessory', _bridge: { username: '0E:11:11:11:11:11', port: 51001, name: 'Test Bridge', env: {} } }], { pluginType: 'accessory' })
        modal.hapEnabledBlocks.set({})
        modal.matterEnabledBlocks.set({ 0: false })

        await save(modal)

        expect(toastr.error).not.toHaveBeenCalled()
        expect(api.callsTo('post', /config-editor\/plugin/)).toHaveLength(1)
      })

      it('refuses an invalid bridge name', async () => {
        const modal = await open([bridgeBlock({ name: '!! bad name' })])

        await save(modal)

        expect(api.callsTo('post')).toEqual([])
        expect(toastr.error).toHaveBeenCalledWith('plugins.bridge.name_error', 'toast.title_error')
      })

      it('refuses an invalid hap port, naming the protocol', async () => {
        const modal = await open([bridgeBlock({ port: 80 })])

        await save(modal)

        expect(api.callsTo('post')).toEqual([])
        expect(toastr.error).toHaveBeenCalledWith('plugins.bridge.port_error', 'toast.title_error')
      })

      it('refuses an invalid matter port', async () => {
        const modal = await open([bridgeBlock({ matter: { port: 80 } })])
        modal.matterEnabledBlocks.set({ 0: true })

        await save(modal)

        expect(api.callsTo('post')).toEqual([])
        expect(toastr.error).toHaveBeenCalledWith('plugins.bridge.port_error', 'toast.title_error')
      })

      it('skips the hap checks entirely when hap is switched off', async () => {
        // An invalid port on a disabled protocol must not block the save
        const modal = await open([bridgeBlock({ port: 80, matter: { port: 5541 } })])
        modal.hapEnabledBlocks.set({ 0: false })
        modal.matterEnabledBlocks.set({ 0: true })

        await save(modal)

        expect(api.callsTo('post', /config-editor\/plugin/)).toHaveLength(1)
      })

      it('ignores a problem on a bridge that is switched off', async () => {
        const modal = await open([bridgeBlock(), bridgeBlock({ username: '0E:22:22:22:22:22', port: 80 })])
        modal.enabledBlocks.set({ 0: true, 1: false })
        modal.hapEnabledBlocks.set({ 0: true, 1: false })

        await save(modal)

        expect(api.callsTo('post', /config-editor\/plugin/)).toHaveLength(1)
      })
    })

    describe('what it writes', () => {
      it('posts the config blocks to the plugin endpoint', async () => {
        const modal = await open([bridgeBlock()])

        await save(modal)

        const call = api.lastCall('post', /config-editor\/plugin/)
        expect(call?.url).toBe('/config-editor/plugin/homebridge-test')
        expect(call?.body).toBe(modal.configBlocks())
      })

      it('drops a matter block with no port rather than writing an empty one', async () => {
        const modal = await open([bridgeBlock({ matter: { port: null } })])

        await save(modal)

        expect(modal.configBlocks()[0]._bridge.matter).toBeUndefined()
      })

      it('keeps a matter port of zero, which is a real request for any port', async () => {
        const modal = await open([bridgeBlock({ matter: { port: 0 } })])
        modal.matterEnabledBlocks.set({ 0: false })

        await save(modal)

        expect(modal.configBlocks()[0]._bridge.matter).toEqual({ port: 0 })
      })

      it('writes the externals-only flag only while hap is off', async () => {
        const modal = await open([bridgeBlock({ matter: { port: 5541 } })], {
          featureFlags: { protocolExternalsOnly: true },
        })
        modal.hapEnabledBlocks.set({ 0: false })
        modal.matterEnabledBlocks.set({ 0: true })
        modal.hapExternalsOnlyBlocks.set({ 0: true })

        await save(modal)

        expect(modal.configBlocks()[0]._bridge.hap).toEqual({ enabled: false, externalsOnly: true })
      })

      it('does not write externals-only while hap is still on', async () => {
        const modal = await open([bridgeBlock()], { featureFlags: { protocolExternalsOnly: true } })
        modal.hapEnabledBlocks.set({ 0: true })
        modal.hapExternalsOnlyBlocks.set({ 0: true })

        await save(modal)

        expect(modal.configBlocks()[0]._bridge.hap).toBeUndefined()
      })
    })

    describe('cleaning up afterwards', () => {
      it('deletes the pairing of a bridge the user switched off', async () => {
        const modal = await open([bridgeBlock()])
        await modal.toggleExternalBridge(modal.configBlocks()[0], false, '0')

        await save(modal)

        // Colons stripped: the endpoint takes the device id, not the username
        expect(api.lastCall('delete')?.url).toBe('/server/pairings/0E1111111111')
      })

      it('carries on and reports a deletion that fails', async () => {
        const modal = await open([bridgeBlock()], {
          arrange: () => api.fail('delete', /^\/server\/pairings\//, new Error('not found')),
        })
        await modal.toggleExternalBridge(modal.configBlocks()[0], false, '0')

        await save(modal)

        expect(toastr.error).toHaveBeenCalledWith('settings.reset_bridge.error', 'toast.title_error')
        // The config itself still went out
        expect(api.callsTo('post', /config-editor\/plugin/)).toHaveLength(1)
      })

      it('does not delete matter storage separately when the whole pairing has gone', async () => {
        // The pairing endpoint removes the matter commissioning too, so a
        // second delete would just 404
        const modal = await open([bridgeBlock({ matter: { port: 5541 } })])
        modal.originalMatterBridges.set([{ username: '0E:11:11:11:11:11', port: 5541 } as any])
        modal.hapEnabledBlocks.set({ 0: true })
        modal.matterEnabledBlocks.set({ 0: true })
        await modal.toggleExternalBridge(modal.configBlocks()[0], false, '0')

        await save(modal)

        expect(api.callsTo('delete').map(call => call.url)).toEqual(['/server/pairings/0E1111111111'])
      })

      it('deletes only the matter storage when just matter was switched off', async () => {
        const modal = await open([bridgeBlock({ matter: { port: 5541 } })])
        modal.originalMatterBridges.set([{ username: '0E:11:11:11:11:11', port: 5541 } as any])
        modal.hapEnabledBlocks.set({ 0: true })
        modal.matterEnabledBlocks.set({ 0: true })
        await modal.toggleMatterBridge(modal.configBlocks()[0], false, '0')

        await save(modal)

        expect(api.callsTo('delete').map(call => call.url)).toEqual(['/server/pairings/0E1111111111/matter'])
      })
    })

    describe('which exit it takes', () => {
      it('offers a restart when the bridge config changed', async () => {
        const modal = await open([{ platform: 'TestPlatform' }])
        await modal.toggleExternalBridge(modal.configBlocks()[0], true, '0')

        await save(modal)

        expect(activeModal.close).toHaveBeenCalledWith()
        expect(modalService.lastOpened()!.content).toBe(RestartHomebridgeComponent)
      })

      it('closes quietly when nothing at all changed', async () => {
        const modal = await open([bridgeBlock()])

        await save(modal)

        expect(activeModal.close).toHaveBeenCalledWith()
        expect(modalService.opened).toEqual([])
      })

      it('closes asking for a refresh when only an alert preference changed', async () => {
        // No restart is needed for a purely cosmetic preference
        const modal = await open([bridgeBlock()])
        modal.toggleHideUnpairing('0E:11:11:11:11:11', 'hap')

        await save(modal)

        expect(activeModal.close).toHaveBeenCalledWith('refresh')
        expect(modalService.opened).toEqual([])
      })

      it('still offers a restart when opened straight after a first install', async () => {
        // The plugin config modal skipped its own restart prompt and left it to
        // this one, so declining the child bridge must not close silently -
        // that looked like the config had not saved at all (#2946)
        const modal = await open([bridgeBlock()], { data: { justInstalled: true } })

        await save(modal)

        expect(modalService.lastOpened()!.content).toBe(RestartHomebridgeComponent)
      })

      it('reports a failed save and stays open', async () => {
        const modal = await open([bridgeBlock()], {
          arrange: () => api.fail('post', /config-editor\/plugin/, new Error('config.json is not writable')),
        })

        await save(modal)

        expect(toastr.error).toHaveBeenCalledWith('config.json is not writable', 'toast.title_error')
        expect(activeModal.close).not.toHaveBeenCalled()
        expect(modal.saveInProgress()).toBe(false)
      })
    })
  })

  /**
   * Switching a child bridge on and off.
   *
   * ⚠️ **A child bridge is not just a flag.** Turning one on writes a `_bridge`
   * block with a username, an unused port and a name; turning it off has to
   * remember all of that, because re-enabling with a *new* username means the user
   * re-pairs the bridge in the Home app from scratch.
   *
   * ⚠️ **Matter rides along with it.** A bridge with Matter on keeps its Matter port
   * cached while the child bridge is off, and gets it back on re-enable — unless the
   * user had already turned Matter off by hand, in which case turning the child
   * bridge back on must not quietly turn Matter back on too.
   */
  describe('switching a child bridge on and off', () => {
    /** A platform block with no bridge yet. */
    const plain = () => ({ platform: 'TestPlatform', name: 'Test' })

    it('writes a bridge with a username, a port and a name', async () => {
      const modal = await open([plain()])
      const block: any = plain()

      await modal.toggleExternalBridge(block, true, '0')

      expect(block._bridge).toMatchObject({ port: 51234, name: 'Test Plugin' })
      expect(block._bridge.username).toMatch(/^[0-9A-F]{2}(:[0-9A-F]{2}){5}$/)
      expect(modal.enabledBlocks()[0]).toBe(true)
    })

    it('turns hap on with it', async () => {
      // A child bridge with neither protocol exposes nothing
      const modal = await open([plain()])
      const block: any = plain()

      await modal.toggleExternalBridge(block, true, '0')

      expect(modal.hapEnabledBlocks()[0]).toBe(true)
    })

    it('gives the username back when it is re-enabled', async () => {
      // ⚠️ A fresh username means re-pairing the bridge in the Home app
      const modal = await open([{ platform: 'TestPlatform', name: 'Test', _bridge: { username: '0E:11:22:33:44:55', port: 51820 } }])
      const block: any = { platform: 'TestPlatform', name: 'Test', _bridge: { username: '0E:11:22:33:44:55', port: 51820 } }

      await modal.toggleExternalBridge(block, false, '0')
      await modal.toggleExternalBridge(block, true, '0')

      expect(block._bridge.username).toBe('0E:11:22:33:44:55')
    })

    it('keeps the name the user gave the bridge', async () => {
      const modal = await open([{ platform: 'TestPlatform', name: 'Test', _bridge: { username: '0E:11:22:33:44:55', port: 51820, name: 'My Bridge' } }])
      const block: any = { platform: 'TestPlatform', name: 'Test', _bridge: { username: '0E:11:22:33:44:55', port: 51820, name: 'My Bridge' } }

      await modal.toggleExternalBridge(block, false, '0')
      await modal.toggleExternalBridge(block, true, '0')

      expect(block._bridge.name).toBe('My Bridge')
    })

    it('marks the bridge for deletion when switched off', async () => {
      const modal = await open(
        [{ platform: 'TestPlatform', name: 'Test', _bridge: { username: '0E:11:22:33:44:55', port: 51820 } }],
        { arrange: () => api.respond('get', '/config-editor/ui', { childBridges: [{ username: '0E:11:22:33:44:55', displayName: 'Test Bridge' }] }) },
      )
      const block: any = { platform: 'TestPlatform', name: 'Test', _bridge: { username: '0E:11:22:33:44:55', port: 51820 } }

      await modal.toggleExternalBridge(block, false, '0')

      expect(modal.deleteBridges().map(b => b.id)).toContain('0E:11:22:33:44:55')
    })

    it('takes it off the deletion list when switched back on', async () => {
      const modal = await open(
        [{ platform: 'TestPlatform', name: 'Test', _bridge: { username: '0E:11:22:33:44:55', port: 51820 } }],
        { arrange: () => api.respond('get', '/config-editor/ui', { childBridges: [{ username: '0E:11:22:33:44:55', displayName: 'Test Bridge' }] }) },
      )
      const block: any = { platform: 'TestPlatform', name: 'Test', _bridge: { username: '0E:11:22:33:44:55', port: 51820 } }

      await modal.toggleExternalBridge(block, false, '0')
      await modal.toggleExternalBridge(block, true, '0')

      expect(modal.deleteBridges()).toEqual([])
    })

    it('remembers the matter port while the child bridge is off', async () => {
      const withMatter = {
        platform: 'TestPlatform',
        name: 'Test',
        _bridge: { username: '0E:11:22:33:44:55', port: 51820, matter: { port: 5551 } },
      }
      const modal = await open([withMatter], { featureFlags: { matterSupport: true } })
      const block: any = JSON.parse(JSON.stringify(withMatter))

      await modal.toggleExternalBridge(block, false, '0')
      await modal.toggleExternalBridge(block, true, '0')

      expect(block._bridge.matter).toMatchObject({ port: 5551 })
      expect(modal.matterEnabledBlocks()[0]).toBe(true)
    })

    it('does nothing at all without a plugin', async () => {
      const modal = await open([plain()])
      ;(modal as any).plugin = undefined
      const block: any = plain()

      await modal.toggleExternalBridge(block, true, '0')

      expect(block._bridge).toBeUndefined()
    })
  })

  /**
   * Leaving the bridge username out of the names HAP publishes.
   *
   * ⚠️ **The preference is written into the block's own `hap` object**, which is
   * the same object that carries `enabled: false`. Rebuilding it carelessly is how
   * a naming preference switches HAP off, or brings it back on.
   */
  describe('the identifying-material toggle', () => {
    const bridged = (hap?: any) => ({
      platform: 'TestPlatform',
      name: 'Test',
      _bridge: { username: '0E:11:22:33:44:55', port: 51820, ...(hap === undefined ? {} : { hap }) },
    })

    const flags = { hapDisableIdentifyingMaterial: true }

    it('writes the flag into the block', async () => {
      const modal = await open([bridged()], { featureFlags: flags })

      modal.toggleHapDisableIdentifyingMaterial(checkboxEvent(true), 0)

      expect(modal.configBlocks()[0]._bridge.hap).toEqual({ disableIdentifyingMaterial: true })
      expect(modal.hapDisableIdentifyingMaterialBlocks()[0]).toBe(true)
    })

    it('takes the whole hap object away again when nothing else is in it', async () => {
      // ⚠️ An empty `hap: {}` left behind is not harmless: it is the object form,
      // and homebridge reads a present object differently from an absent one
      const modal = await open([bridged()], { featureFlags: flags })

      modal.toggleHapDisableIdentifyingMaterial(checkboxEvent(true), 0)
      modal.toggleHapDisableIdentifyingMaterial(checkboxEvent(false), 0)

      expect(modal.configBlocks()[0]._bridge.hap).toBeUndefined()
    })

    it('keeps hap switched off while the flag is added', async () => {
      // ⚠️ The one that matters most here: a rebuild that dropped `enabled: false`
      // would quietly switch the bridge's hap back on
      const modal = await open([bridged({ enabled: false })], { featureFlags: flags })

      modal.toggleHapDisableIdentifyingMaterial(checkboxEvent(true), 0)

      expect(modal.configBlocks()[0]._bridge.hap)
        .toEqual({ enabled: false, disableIdentifyingMaterial: true })
    })

    it('keeps hap switched off after the flag is taken away', async () => {
      const modal = await open([bridged({ enabled: false })], { featureFlags: flags })

      modal.toggleHapDisableIdentifyingMaterial(checkboxEvent(false), 0)

      expect(modal.configBlocks()[0]._bridge.hap).toEqual({ enabled: false })
    })

    it('turns the legacy boolean form into an object', async () => {
      // `hap: false` is the old way of saying disabled, and the flag has nowhere to
      // live until it becomes an object
      const modal = await open([bridged(false)], { featureFlags: flags })

      modal.toggleHapDisableIdentifyingMaterial(checkboxEvent(true), 0)

      expect(modal.configBlocks()[0]._bridge.hap)
        .toEqual({ enabled: false, disableIdentifyingMaterial: true })
    })

    it('writes enabled false for a bridge the user just switched off', async () => {
      // The block still says nothing about hap, but the screen does
      const modal = await open([bridged()], { featureFlags: { ...flags, matterSupport: true } })
      modal.hapEnabledBlocks.set({ 0: false })

      modal.toggleHapDisableIdentifyingMaterial(checkboxEvent(true), 0)

      expect(modal.configBlocks()[0]._bridge.hap)
        .toEqual({ enabled: false, disableIdentifyingMaterial: true })
    })

    it('keeps the other hap settings it finds', async () => {
      const modal = await open([bridged({ enabled: false, externalsOnly: true })], { featureFlags: flags })

      modal.toggleHapDisableIdentifyingMaterial(checkboxEvent(true), 0)

      expect(modal.configBlocks()[0]._bridge.hap)
        .toEqual({ enabled: false, externalsOnly: true, disableIdentifyingMaterial: true })
    })

    it('still remembers the tick for a block with no bridge', async () => {
      // The toggle is offered before the child bridge is created, and the answer
      // has to survive until it is
      const modal = await open([{ platform: 'TestPlatform', name: 'Test' }], { featureFlags: flags })

      modal.toggleHapDisableIdentifyingMaterial(checkboxEvent(true), 0)

      expect(modal.hapDisableIdentifyingMaterialBlocks()[0]).toBe(true)
    })

    it('does nothing while the runtime does not support it', async () => {
      const modal = await open([bridged()], { featureFlags: { hapDisableIdentifyingMaterial: false } })

      modal.toggleHapDisableIdentifyingMaterial(checkboxEvent(true), 0)

      expect(modal.configBlocks()[0]._bridge.hap).toBeUndefined()
      expect(modal.hapDisableIdentifyingMaterialBlocks()[0]).toBeFalsy()
    })
  })

  /**
   * Making a bridge's matter responder IPv6-only.
   */
  describe('the matter ipv4 toggle', () => {
    const bridged = (matter?: any) => ({
      platform: 'TestPlatform',
      name: 'Test',
      _bridge: { username: '0E:11:22:33:44:55', port: 51820, ...(matter === undefined ? {} : { matter }) },
    })

    const flags = { matterSupport: true, matterDisableIpv4: true }

    it('writes the flag into the matter block', async () => {
      const modal = await open([bridged({ port: 5551 })], { featureFlags: flags })

      modal.toggleMatterDisableIpv4(checkboxEvent(true), 0)

      expect(modal.configBlocks()[0]._bridge.matter).toEqual({ port: 5551, disableIpv4: true })
      expect(modal.matterDisableIpv4Blocks()[0]).toBe(true)
    })

    it('removes the flag rather than writing it false', async () => {
      // ⚠️ `disableIpv4: false` and no key at all mean the same thing to homebridge,
      // but only the missing key keeps the config file clean
      const modal = await open([bridged({ port: 5551, disableIpv4: true })], { featureFlags: flags })

      modal.toggleMatterDisableIpv4(checkboxEvent(false), 0)

      expect(modal.configBlocks()[0]._bridge.matter).toEqual({ port: 5551 })
    })

    it('remembers the tick for a bridge with no matter block yet', async () => {
      const modal = await open([bridged()], { featureFlags: flags })

      modal.toggleMatterDisableIpv4(checkboxEvent(true), 0)

      expect(modal.matterDisableIpv4Blocks()[0]).toBe(true)
      expect(modal.configBlocks()[0]._bridge.matter).toBeUndefined()
    })

    it('keeps the flag across switching matter off and on again', async () => {
      // ⚠️ The cache is what carries it: switching matter off removes the block, so
      // without this the preference is lost on the round trip
      const modal = await open([bridged({ port: 5551 })], { featureFlags: flags })

      modal.toggleMatterDisableIpv4(checkboxEvent(true), 0)

      expect(modal.matterBridgeCache().get(0)).toMatchObject({ disableIpv4: true })
    })

    it('does nothing while the runtime does not support it', async () => {
      const modal = await open([bridged({ port: 5551 })], {
        featureFlags: { matterSupport: true, matterDisableIpv4: false },
      })

      modal.toggleMatterDisableIpv4(checkboxEvent(true), 0)

      expect(modal.configBlocks()[0]._bridge.matter).toEqual({ port: 5551 })
      expect(modal.matterDisableIpv4Blocks()[0]).toBeFalsy()
    })
  })

  /**
   * Hiding the "this bridge is not paired" notice.
   */
  describe('the unpairing notice', () => {
    const bridged = () => ({
      platform: 'TestPlatform',
      name: 'Test',
      _bridge: { username: '0E:11:22:33:44:55', port: 51820 },
    })

    it.each([
      ['hap', 'hideHapAlert'],
      ['matter', 'hideMatterAlert'],
    ])('hides the %s notice', async (protocol, key) => {
      const modal = await open([bridged()])

      modal.toggleHideUnpairing('0E:11:22:33:44:55', protocol as 'hap' | 'matter')

      expect(modal.isUnpairingHidden('0E:11:22:33:44:55', protocol as 'hap' | 'matter')).toBe(true)
      expect((modal as any).bridgeConfigs.get('0E:11:22:33:44:55')[key]).toBe(true)
    })

    it.each(['hap', 'matter'])('shows the %s notice again on a second click', async (protocol) => {
      const modal = await open([bridged()])

      modal.toggleHideUnpairing('0E:11:22:33:44:55', protocol as 'hap' | 'matter')
      modal.toggleHideUnpairing('0E:11:22:33:44:55', protocol as 'hap' | 'matter')

      expect(modal.isUnpairingHidden('0E:11:22:33:44:55', protocol as 'hap' | 'matter')).toBe(false)
    })

    it('keeps the two protocols apart', async () => {
      // They are separate notices about separate pairings
      const modal = await open([bridged()], { featureFlags: { matterSupport: true } })

      modal.toggleHideUnpairing('0E:11:22:33:44:55', 'hap')

      expect(modal.isUnpairingHidden('0E:11:22:33:44:55', 'matter')).toBe(false)
    })

    it('finds the bridge whatever case was passed in', async () => {
      const modal = await open([bridged()])

      modal.toggleHideUnpairing('0e:11:22:33:44:55', 'hap')

      expect(modal.isUnpairingHidden('0E:11:22:33:44:55', 'hap')).toBe(true)
    })

    it('records it for a bridge the settings never listed', async () => {
      const modal = await open([bridged()])

      modal.toggleHideUnpairing('0E:11:22:33:44:66', 'hap')

      expect(modal.isUnpairingHidden('0E:11:22:33:44:66', 'hap')).toBe(true)
    })

    it('saves it as a refresh rather than a restart', async () => {
      // ⚠️ Homebridge reads nothing here, so a restart prompt is downtime over a
      // notice the user chose to stop seeing
      const modal = await open([bridged()], {
        env: { bridges: [{ username: '0E:11:22:33:44:55', name: 'Test' }] },
      })

      modal.toggleHideUnpairing('0E:11:22:33:44:55', 'hap')
      await modal.save()

      expect(api.lastCall('put', /hide-hap-alert/)?.body).toBeDefined()
      expect(activeModal.close).toHaveBeenCalledWith('refresh')
    })
  })

  /**
   * What counts as a change worth restarting for.
   *
   * ⚠️ **Every one of these fields is read by HAP at startup only.** Reporting no
   * change would leave the user's edit sitting in the config with the running
   * bridge still on the old value, and nothing on screen to say so.
   */
  describe('deciding whether a restart is needed', () => {
    /** A saved bridge, and the matching config block. */
    function withBridge(bridgeOverrides: Record<string, any> = {}, savedOverrides: Record<string, any> = {}) {
      const username = '0E:11:22:33:44:55'
      return {
        config: [{
          platform: 'TestPlatform',
          name: 'Test',
          _bridge: { username, port: 51820, name: 'Test Bridge', ...bridgeOverrides },
        }],
        env: { bridges: [{ username, name: 'Test' }] },
        saved: { username, port: 51820, name: 'Test Bridge', ...savedOverrides },
      }
    }

    /**
     * Save with the original bridge state pinned, and report which exit was taken.
     * @param bridgeOverrides - the bridge as it is on screen
     * @param savedOverrides - the bridge as it was when the modal opened
     */
    async function savedWithOriginal(bridgeOverrides: Record<string, any>, savedOverrides: Record<string, any>) {
      const { config, env, saved } = withBridge(bridgeOverrides, savedOverrides)
      const modal = await open(config, { env, featureFlags: { childBridgeDebugMode: true } })
      // ⚠️ Set after opening: `originalBridges` is filled from the config the modal
      // was given, so a difference has to be introduced here rather than in the
      // fixture, or there would be nothing to compare against
      modal.originalBridges.set([saved] as any)

      await modal.save()

      return modal
    }

    it.each([
      ['the bridge name', { name: 'Renamed Bridge' }],
      ['the port', { port: 51999 }],
      ['the model', { model: 'Something Else' }],
      ['the manufacturer', { manufacturer: 'Someone Else' }],
      ['the firmware revision', { firmwareRevision: '9.9.9' }],
      ['the debug setting', { debugModeEnabled: true }],
      ['the debug environment variable', { env: { DEBUG: 'homebridge*' } }],
      ['the node options', { env: { NODE_OPTIONS: '--max-old-space-size=256' } }],
    ])('offers a restart when %s changed', async (_case, overrides) => {
      await savedWithOriginal(overrides, {})

      expect(modalService.lastOpened()!.content).toBe(RestartHomebridgeComponent)
    })

    it('offers a restart when hap was switched off', async () => {
      // ⚠️ Driven through the on-screen toggle, not by putting `hap` in the fixture:
      // the save normalises the block from the toggles first, so a hand-written
      // `hap` that the screen disagrees with is rewritten before the comparison
      const { config, env, saved } = withBridge()
      const modal = await open(config, { env, featureFlags: { matterSupport: true } })
      modal.originalBridges.set([saved] as any)
      modal.hapEnabledBlocks.set({ 0: false })
      modal.matterEnabledBlocks.set({ 0: true })

      await modal.save()

      expect(modalService.lastOpened()!.content).toBe(RestartHomebridgeComponent)
    })

    it('offers a restart when the externals-only flag was set', async () => {
      const { config, env, saved } = withBridge()
      const modal = await open(config, {
        env,
        featureFlags: { matterSupport: true, protocolExternalsOnly: true },
      })
      modal.originalBridges.set([{ ...saved, hap: { enabled: false } }] as any)
      modal.hapEnabledBlocks.set({ 0: false })
      modal.matterEnabledBlocks.set({ 0: true })
      modal.hapExternalsOnlyBlocks.set({ 0: true })

      await modal.save()

      expect(modalService.lastOpened()!.content).toBe(RestartHomebridgeComponent)
    })

    it('offers a restart when a bridge was added', async () => {
      await savedWithOriginal({}, { username: '0E:11:22:33:44:99' })

      expect(modalService.lastOpened()!.content).toBe(RestartHomebridgeComponent)
    })

    it('closes quietly when nothing on the bridge changed', async () => {
      // The guard on all of the above: without it every case here would pass on a
      // page that always asked for a restart
      await savedWithOriginal({}, {})

      expect(modalService.opened).toEqual([])
    })

    it('reads the legacy boolean and the object form as the same thing', async () => {
      // ⚠️ `hap: false` and `hap: { enabled: false }` both mean off, and treating
      // them as different would ask for a restart over a rewrite that changed
      // nothing the bridge can see
      await savedWithOriginal({ hap: { enabled: false } }, { hap: false })

      expect(modalService.opened).toEqual([])
    })
  })

  /**
   * Leaving for the plugin's own settings.
   */
  describe('going to the plugin settings', () => {
    const bridged = () => ({
      platform: 'TestPlatform',
      name: 'Test',
      _bridge: { username: '0E:11:22:33:44:55', port: 51820 },
    })

    it('closes this modal before opening the other one', async () => {
      // ⚠️ Two modals stacked over each other both write the same config, and the
      // one underneath saves whatever it was holding when the top one closes
      const modal = await open([bridged()])

      modal.openPluginConfig()

      expect(activeModal.close).toHaveBeenCalled()
      expect(managePlugins.settings).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'homebridge-test', settingsSchema: true }),
      )
    })

    it('does nothing without a plugin', async () => {
      const modal = await open([bridged()])
      ;(modal as any).plugin = undefined

      modal.openPluginConfig()

      expect(managePlugins.settings).not.toHaveBeenCalled()
      expect(activeModal.close).not.toHaveBeenCalled()
    })
  })

  /**
   * Saving alongside a bridge that is on its way out.
   *
   * ⚠️ **A bridge being deleted must not be written to on the way past.** Its
   * endpoints answer for a bridge that is about to stop existing, so the writes
   * either fail and are reported to the user as an error, or succeed and leave
   * settings behind for a bridge that has gone.
   */
  describe('saving around a bridge that is being deleted', () => {
    const username = '0E:11:22:33:44:55'

    const bridged = () => ({
      platform: 'TestPlatform',
      name: 'Test',
      _bridge: { username, port: 51820 },
    })

    /** The page with one saved bridge, marked for deletion. */
    async function withDeletedBridge() {
      const modal = await open([bridged()], {
        env: { bridges: [{ username, name: 'Test' }] },
      })
      modal.deleteBridges.set([{ id: username, name: 'Test' }] as any)
      return modal
    }

    it('writes no alert preference for it', async () => {
      const modal = await withDeletedBridge()
      modal.toggleHideUnpairing(username, 'hap')

      await modal.save()

      expect(api.callsTo('put').filter(call => call.url.includes('hide-hap-alert'))).toEqual([])
    })

    it('writes no restart schedule for it', async () => {
      const modal = await withDeletedBridge()
      modal.onScheduledRestartCronChange('0 4 * * *', username)

      await modal.save()

      expect(api.callsTo('put').filter(call => call.url.includes('scheduled-restart-cron'))).toEqual([])
    })

    it('still writes them for a bridge that is staying', async () => {
      // The guard on both cases above: without it they would pass on a page that
      // never wrote these at all
      const modal = await open([bridged()], {
        env: { bridges: [{ username, name: 'Test' }] },
      })
      modal.toggleHideUnpairing(username, 'hap')
      modal.onScheduledRestartCronChange('0 4 * * *', username)

      await modal.save()

      expect(api.callsTo('put').filter(call => call.url.includes('hide-hap-alert'))).toHaveLength(1)
      expect(api.callsTo('put').filter(call => call.url.includes('scheduled-restart-cron'))).toHaveLength(1)
    })
  })

  describe('the matter unpairing notice', () => {
    const username = '0E:11:22:33:44:55'

    const bridged = () => ({
      platform: 'TestPlatform',
      name: 'Test',
      _bridge: { username, port: 51820, matter: { port: 5551 } },
    })

    it('writes it to its own endpoint, separately from the hap one', async () => {
      // ⚠️ Two separate notices about two separate pairings. One endpoint for both
      // would silence a notice the user is still relying on
      const modal = await open([bridged()], {
        env: { bridges: [{ username, name: 'Test' }] },
        featureFlags: { matterSupport: true },
      })

      modal.toggleHideUnpairing(username, 'matter')
      await modal.save()

      expect(api.callsTo('put').filter(call => call.url.includes('hide-matter-alert'))).toHaveLength(1)
      expect(api.callsTo('put').filter(call => call.url.includes('hide-hap-alert'))).toEqual([])
    })

    it('saves the rest when the notice write fails', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {})
      const modal = await open([bridged()], {
        env: { bridges: [{ username, name: 'Test' }] },
        featureFlags: { matterSupport: true },
        arrange: () => api.fail('put', /hide-matter-alert/, new Error('config not writable')),
      })

      modal.toggleHideUnpairing(username, 'matter')
      await modal.save()

      expect(api.callsTo('post', '/config-editor/plugin/homebridge-test')).toHaveLength(1)
    })
  })

  /**
   * The per-bridge restart schedule.
   *
   * ⚠️ **Usernames are stored upper case and typed in either case.** A lookup that
   * did not normalise would show an empty box over a schedule that exists, and
   * then save a second entry for the same bridge.
   */
  describe('the restart schedule', () => {
    const withCron = (cron?: string) => ({
      bridges: [{ username: '0E:11:22:33:44:55', name: 'Test', ...(cron ? { scheduledRestartCron: cron } : {}) }],
    })

    const bridged = () => ({
      platform: 'TestPlatform',
      name: 'Test',
      _bridge: { username: '0E:11:22:33:44:55', port: 51820 },
    })

    /** The cron endpoint for the bridge these cases use. */
    const CRON_URL = '/config-editor/ui/bridges/0E%3A11%3A22%3A33%3A44%3A55/scheduled-restart-cron'

    it('shows the schedule a bridge already has', async () => {
      const modal = await open([bridged()], { env: withCron('0 4 * * *') })

      expect(modal.getScheduledRestartCron('0E:11:22:33:44:55')).toBe('0 4 * * *')
    })

    it('finds it however the username is cased', async () => {
      const modal = await open([bridged()], { env: withCron('0 4 * * *') })

      expect(modal.getScheduledRestartCron('0e:11:22:33:44:55')).toBe('0 4 * * *')
    })

    it.each([
      ['a bridge with no schedule', '0E:11:22:33:44:55'],
      ['a bridge it has never seen', 'FF:FF:FF:FF:FF:FF'],
    ])('shows nothing for %s', async (_case, username) => {
      const modal = await open([bridged()], { env: withCron() })

      expect(modal.getScheduledRestartCron(username)).toBe('')
    })

    it('shows nothing when there is no username to look up', async () => {
      const modal = await open([bridged()])

      expect(modal.getScheduledRestartCron(undefined)).toBe('')
    })

    it('writes a new schedule to the bridge endpoint on save', async () => {
      const modal = await open([bridged()], { env: withCron() })

      modal.onScheduledRestartCronChange('0 4 * * *', '0E:11:22:33:44:55')
      await modal.save()

      expect(api.lastCall('put', CRON_URL)?.body).toEqual({ value: '0 4 * * *' })
    })

    it('records it against the bridge whatever case was typed', async () => {
      const modal = await open([bridged()], { env: withCron() })

      modal.onScheduledRestartCronChange('0 4 * * *', '0e:11:22:33:44:55')

      expect(modal.getScheduledRestartCron('0E:11:22:33:44:55')).toBe('0 4 * * *')
    })

    it('clears the schedule when the box is emptied', async () => {
      const modal = await open([bridged()], { env: withCron('0 4 * * *') })

      modal.onScheduledRestartCronChange('', '0E:11:22:33:44:55')
      await modal.save()

      expect(api.lastCall('put', CRON_URL)?.body).toEqual({ value: null })
    })

    it('treats a box of spaces as empty', async () => {
      const modal = await open([bridged()], { env: withCron('0 4 * * *') })

      modal.onScheduledRestartCronChange('   ', '0E:11:22:33:44:55')

      expect(modal.getScheduledRestartCron('0E:11:22:33:44:55')).toBe('')
    })

    it('keeps a schedule for a bridge the settings did not list', async () => {
      // A bridge added in this very modal has no saved entry to update
      const modal = await open([bridged()])

      modal.onScheduledRestartCronChange('0 4 * * *', '0E:11:22:33:44:66')

      expect(modal.getScheduledRestartCron('0E:11:22:33:44:66')).toBe('0 4 * * *')
    })

    it('ignores a change with no bridge to attach it to', async () => {
      const modal = await open([bridged()], { env: withCron() })

      expect(() => modal.onScheduledRestartCronChange('0 4 * * *', '')).not.toThrow()

      await modal.save()

      expect(api.callsTo('put', CRON_URL)).toEqual([])
    })

    it('writes nothing when the schedule was not changed', async () => {
      const modal = await open([bridged()], { env: withCron('0 4 * * *') })

      await modal.save()

      expect(api.callsTo('put', CRON_URL)).toEqual([])
    })

    it('asks for a full service restart, because the schedule lives outside homebridge', async () => {
      const modal = await open([bridged()], { env: withCron() })

      modal.onScheduledRestartCronChange('0 4 * * *', '0E:11:22:33:44:55')
      await modal.save()

      expect(api.callsTo('put', '/platform-tools/hb-service/set-full-service-restart-flag')).toHaveLength(1)
    })

    it('carries on when the schedule write fails', async () => {
      // The config itself has already saved, so the restart still has to be offered
      vi.spyOn(console, 'error').mockImplementation(() => {})
      const modal = await open([bridged()], {
        env: withCron(),
        arrange: () => api.fail('put', CRON_URL, new Error('config not writable')),
      })

      modal.onScheduledRestartCronChange('0 4 * * *', '0E:11:22:33:44:55')
      await modal.save()

      expect(modalService.lastOpened()!.content).toBe(RestartHomebridgeComponent)
    })
  })

  /**
   * The per-plugin "stop suggesting a child bridge" preference.
   */
  describe('hiding the set-up recommendation', () => {
    const bridged = () => ({
      platform: 'TestPlatform',
      name: 'Test',
      _bridge: { username: '0E:11:22:33:44:55', port: 51820 },
    })

    const HIDE_URL = '/config-editor/ui/plugins/hide-child-bridge-setup-for'

    it('starts ticked for a plugin already on the list', async () => {
      const modal = await open([bridged()], {
        env: { plugins: { hideChildBridgeSetupFor: ['homebridge-test'] } },
      })

      expect(modal.hideChildBridgeSetup()).toBe(true)
    })

    it('adds the plugin to the list', async () => {
      const modal = await open([bridged()], {
        env: {
          bridges: [{ username: '0E:11:22:33:44:55', name: 'Test' }],
          plugins: { hideChildBridgeSetupFor: ['homebridge-other'] },
        },
      })

      modal.toggleHideChildBridgeSetup()
      await modal.save()

      // ⚠️ Sorted, and sent whole: the endpoint replaces the list, so an unsorted
      // or partial one silently reorders or drops other people's plugins
      expect(api.lastCall('put', HIDE_URL)?.body).toEqual({ body: ['homebridge-other', 'homebridge-test'] })
    })

    it('takes the plugin off the list again', async () => {
      const modal = await open([bridged()], {
        env: {
          bridges: [{ username: '0E:11:22:33:44:55', name: 'Test' }],
          plugins: { hideChildBridgeSetupFor: ['homebridge-other', 'homebridge-test'] },
        },
      })

      modal.toggleHideChildBridgeSetup()
      await modal.save()

      expect(api.lastCall('put', HIDE_URL)?.body).toEqual({ body: ['homebridge-other'] })
    })

    it('keeps the local copy in step, so the plugins page agrees', async () => {
      const modal = await open([bridged()], {
        env: { bridges: [{ username: '0E:11:22:33:44:55', name: 'Test' }] },
      })

      modal.toggleHideChildBridgeSetup()
      await modal.save()

      expect(settings.setEnvItem).toHaveBeenCalledWith('plugins.hideChildBridgeSetupFor', ['homebridge-test'])
    })

    it('closes for a refresh rather than a restart', async () => {
      // ⚠️ Nothing homebridge reads has changed, so a restart prompt here is a
      // minute of downtime over a preference in the UI
      const modal = await open([bridged()], {
        env: { bridges: [{ username: '0E:11:22:33:44:55', name: 'Test' }] },
      })

      modal.toggleHideChildBridgeSetup()
      await modal.save()

      expect(activeModal.close).toHaveBeenCalledWith('refresh')
      expect(modalService.opened).toEqual([])
    })

    it('writes nothing when the toggle was not touched', async () => {
      const modal = await open([bridged()], {
        env: { bridges: [{ username: '0E:11:22:33:44:55', name: 'Test' }] },
      })

      await modal.save()

      expect(api.callsTo('put', HIDE_URL)).toEqual([])
    })

    it('saves the rest when the preference write fails', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {})
      const modal = await open([bridged()], {
        env: { bridges: [{ username: '0E:11:22:33:44:55', name: 'Test' }] },
        arrange: () => api.fail('put', HIDE_URL, new Error('config not writable')),
      })

      modal.toggleHideChildBridgeSetup()
      await modal.save()

      expect(api.callsTo('post', '/config-editor/plugin/homebridge-test')).toHaveLength(1)
    })
  })

  /**
   * The externals-only flag on a bridge.
   *
   * ⚠️ It only means anything while the protocol is switched **off**: it says
   * "publish nothing on this protocol except accessories that carry their own
   * pairing code".
   */
  describe('the matter externals-only flag', () => {
    const bridged = () => ({
      platform: 'TestPlatform',
      name: 'Test',
      _bridge: { username: '0E:11:22:33:44:55', port: 51820, matter: { port: 5551 } },
    })

    it('marks the block when it is ticked', async () => {
      const modal = await open([bridged()], { featureFlags: { matterSupport: true, protocolExternalsOnly: true } })

      await modal.toggleMatterExternalsOnly(checkboxEvent(true), 0)

      expect(modal.matterExternalsOnlyBlocks()[0]).toBe(true)
      expect(modal.configBlocks()[0]._bridge.matter.externalsOnly).toBe(true)
    })

    it('clears it again when unticked', async () => {
      const modal = await open([bridged()], { featureFlags: { matterSupport: true, protocolExternalsOnly: true } })
      await modal.toggleMatterExternalsOnly(checkboxEvent(true), 0)

      await modal.toggleMatterExternalsOnly(checkboxEvent(false), 0)

      expect(modal.matterExternalsOnlyBlocks()[0]).toBe(false)
      expect(modal.configBlocks()[0]._bridge.matter?.externalsOnly).toBeUndefined()
    })

    it('builds a matter block for a bridge that has none', async () => {
      // The flag has nowhere to live otherwise
      const modal = await open(
        [{ platform: 'TestPlatform', name: 'Test', _bridge: { username: '0E:11:22:33:44:55', port: 51820 } }],
        { featureFlags: { matterSupport: true, protocolExternalsOnly: true } },
      )

      await modal.toggleMatterExternalsOnly(checkboxEvent(true), 0)

      expect(modal.configBlocks()[0]._bridge.matter).toMatchObject({ port: 5540, enabled: false, externalsOnly: true })
    })

    it('tears that block out again rather than leaving an orphan', async () => {
      // ⚠️ The block only existed to carry the flag; leaving `{ port, enabled:
      // false }` behind writes matter config the user never asked for
      const modal = await open(
        [{ platform: 'TestPlatform', name: 'Test', _bridge: { username: '0E:11:22:33:44:55', port: 51820 } }],
        { featureFlags: { matterSupport: true, protocolExternalsOnly: true } },
      )
      await modal.toggleMatterExternalsOnly(checkboxEvent(true), 0)

      await modal.toggleMatterExternalsOnly(checkboxEvent(false), 0)

      expect(modal.configBlocks()[0]._bridge.matter).toBeUndefined()
    })

    it('does nothing on an accessory block', async () => {
      // Accessories have no matter configuration of their own
      const modal = await open([{ accessory: 'TestAccessory', name: 'Test' }], {
        pluginType: 'accessory',
        featureFlags: { matterSupport: true, protocolExternalsOnly: true },
      })

      await modal.toggleMatterExternalsOnly(checkboxEvent(true), 0)

      expect(modal.matterExternalsOnlyBlocks()[0]).toBe(false)
    })

    it('does nothing while the runtime does not support it', async () => {
      const modal = await open([bridged()], { featureFlags: { matterSupport: true, protocolExternalsOnly: false } })

      await modal.toggleMatterExternalsOnly(checkboxEvent(true), 0)

      expect(modal.matterExternalsOnlyBlocks()[0]).toBeFalsy()
    })
  })
})

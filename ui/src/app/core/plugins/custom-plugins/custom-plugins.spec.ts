import type { FakeApi, FakeIoNamespace, FakeModalService, FakeSettings, FakeToastr, FakeWs } from '@/testing'
import type { ComponentFixture } from '@angular/core/testing'

import { NO_ERRORS_SCHEMA } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap/modal'
import { TranslatePipe, TranslateService } from '@ngx-translate/core'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { CachedAccessoriesCacheService } from '@/app/core/caching/cached-accessories-cache.service'
import { CUSTOM_PLUGINS_MODAL_DATA } from '@/app/core/modal-data-tokens'
import { CustomPluginsComponent } from '@/app/core/plugins/custom-plugins/custom-plugins.component'
import { CustomPluginsService } from '@/app/core/plugins/custom-plugins/custom-plugins.service'
import { ManagePluginsService } from '@/app/core/plugins/manage-plugins.service'
import { ChildBridgesService } from '@/app/core/utilities/child-bridges.service'
import { environment } from '@/environments/environment'
import { activeModalStub, cachedAccessoriesStub, fakeApi, fakeWs, makeSettings, modalServiceSpy, toastrStub } from '@/testing'
import { provideFakes, provideTestTranslate } from '@/testing/providers'

/**
 * The custom plugin UI host.
 *
 * This is the one screen where third-party code runs inside the app, in an
 * iframe that talks to it over `postMessage`. Two things therefore matter more
 * here than anywhere else:
 *
 * - **the guard on incoming messages.** Any page in any tab can post to this
 *   window; only messages whose `source` is this modal's own iframe and whose
 *   origin is the API's may be acted on.
 * - **the shape of every reply.** The plugin UI's own promise chain is waiting
 *   on it, so a reply that never arrives (or that cannot be structured-cloned)
 *   hangs the plugin's settings screen with no error anywhere.
 */
describe('the custom plugin ui', () => {
  let api: FakeApi
  let ws: FakeWs
  let io: FakeIoNamespace
  let toastr: FakeToastr
  let settings: FakeSettings
  let modal: FakeModalService
  let activeModal: NgbActiveModal
  let accessoryCache: ReturnType<typeof cachedAccessoriesStub>
  let childBridges: { openCorrectRestartModalWithBridges: ReturnType<typeof vi.fn> }
  let managePlugins: { bridgeSettings: ReturnType<typeof vi.fn> }

  const plugin = { name: 'homebridge-example', installedVersion: '1.2.3' } as any

  function makeSchema(overrides: Record<string, any> = {}) {
    return {
      pluginAlias: 'Example',
      pluginType: 'platform',
      strictValidation: false,
      customUi: true,
      ...overrides,
    }
  }

  describe('the modal', () => {
    let fixture: ComponentFixture<CustomPluginsComponent>
    let component: CustomPluginsComponent
    /** The iframe's contentWindow, standing in for the plugin's own page. */
    let pluginWindow: { postMessage: ReturnType<typeof vi.fn> }
    let iframe: HTMLIFrameElement

    interface CreateOptions {
      schema?: Record<string, any> | undefined
      pluginConfig?: Array<Record<string, unknown>>
      recommendChildBridges?: boolean
      hapCache?: any[]
      matterCache?: any[]
      arrange?: () => void
    }

    async function open(options: CreateOptions = {}) {
      TestBed.resetTestingModule()

      api = fakeApi()
        .respond('post', /\/plugins\/settings-ui\/.*\/ticket$/, { ticket: 'test-ticket' })
        .respond('post', /\/plugins\/settings-ui\/.*\/session\/revoke$/, {})
      ws = fakeWs()
      io = ws.namespace('plugins/settings-ui')
      toastr = toastrStub()
      settings = makeSettings({ env: { recommendChildBridges: options.recommendChildBridges ?? false } })
      modal = modalServiceSpy()
      activeModal = activeModalStub()
      accessoryCache = cachedAccessoriesStub(options.hapCache ?? [], options.matterCache ?? [])
      childBridges = { openCorrectRestartModalWithBridges: vi.fn() }
      managePlugins = { bridgeSettings: vi.fn() }

      TestBed.configureTestingModule({
        imports: [CustomPluginsComponent],
        providers: [
          provideTestTranslate(),
          provideFakes({ api, ws, toastr, settings, modal }),
          { provide: NgbActiveModal, useValue: activeModal },
          { provide: CachedAccessoriesCacheService, useValue: accessoryCache },
          { provide: ChildBridgesService, useValue: childBridges },
          { provide: ManagePluginsService, useValue: managePlugins },
          {
            provide: CUSTOM_PLUGINS_MODAL_DATA,
            useValue: {
              plugin,
              schema: 'schema' in options ? options.schema : makeSchema(),
              pluginConfig: options.pluginConfig ?? [{ platform: 'Example', name: 'Example' }],
            },
          },
        ],
      })

      // The schema form and the whole formworks bootstrap theme are dropped:
      // the iframe bridge is what is under test, and the `<iframe>` element the
      // view child looks for is a plain tag the schema still renders
      TestBed.overrideComponent(CustomPluginsComponent, {
        set: {
          imports: [TranslatePipe],
          schemas: [NO_ERRORS_SCHEMA],
        },
      })

      options.arrange?.()

      fixture = TestBed.createComponent(CustomPluginsComponent)
      component = fixture.componentInstance
      fixture.detectChanges()
      await settle()

      // Stand in for the plugin's page inside the iframe
      iframe = fixture.nativeElement.querySelector('iframe')
      pluginWindow = { postMessage: vi.fn() }
      Object.defineProperty(iframe, 'contentWindow', { value: pluginWindow, configurable: true })

      return component
    }

    async function settle() {
      for (let tick = 0; tick < 12; tick += 1) {
        await Promise.resolve()
      }
    }

    /** Let the socket report ready, which is what makes the iframe load. */
    async function ready() {
      io.socket.fire('ready')
      await settle()
    }

    /**
     * Deliver a message the way the plugin's own page does.
     * @param data - the message payload
     * @param overrides - how to bend the guard
     * @param overrides.source - pretend the message came from another window
     * @param overrides.origin - pretend it came from another origin
     */
    async function post(data: Record<string, unknown>, overrides: { source?: unknown, origin?: string } = {}) {
      const event = {
        source: 'source' in overrides ? overrides.source : pluginWindow,
        origin: overrides.origin ?? environment.api.origin,
        data,
      } as unknown as MessageEvent
      window.dispatchEvent(Object.assign(new Event('message'), event))
      await settle()
      return event
    }

    /** Every message sent back to the plugin's page. */
    function replies() {
      return pluginWindow.postMessage.mock.calls.map(call => call[0])
    }

    /** The most recent reply to a request. */
    function lastReply() {
      return replies().filter(reply => reply?.action === 'response').at(-1)
    }

    beforeEach(() => {
      vi.spyOn(console, 'error').mockImplementation(() => {})
      vi.spyOn(console, 'warn').mockImplementation(() => {})
      vi.mocked(console.error).mockClear()
      vi.mocked(console.warn).mockClear()
    })

    afterEach(() => {
      fixture?.destroy()
    })

    describe('starting up', () => {
      it('reads the alias and type out of the schema', async () => {
        await open({ arrange: () => {} })

        expect(component.pluginAlias()).toBe('Example')
        expect(component.pluginType()).toBe('platform')
      })

      it('dismisses rather than rendering when no schema was provided', async () => {
        await open({ schema: undefined })

        expect(activeModal.dismiss).toHaveBeenCalledWith('Missing required data')
        expect(console.error).toHaveBeenCalled()
      })

      it('treats an unconfigured plugin as a first save', async () => {
        await open({ pluginConfig: [] })

        expect(component.isFirstSave()).toBe(true)
      })

      it('does not treat an already configured plugin as a first save', async () => {
        await open()

        expect(component.isFirstSave()).toBe(false)
      })

      it('introduces the plugin to the server on every connection', async () => {
        // The server-side helper dies with the socket, so `start` has to be
        // re-sent on a reconnect - and sent exactly once per connection
        await open()

        expect(io.socket.payloadsFor('start')).toEqual(['homebridge-example'])

        io.connected.next()
        expect(io.socket.payloadsFor('start')).toEqual(['homebridge-example', 'homebridge-example'])
      })

      it('loads the iframe from a one-off ticket once the helper is ready', async () => {
        await open()
        expect(component.loading()).toBe(true)

        await ready()

        expect(component.loading()).toBe(false)
        expect(api.lastCall('post')?.url).toBe('/plugins/settings-ui/homebridge-example/ticket')
        const src = new URL(fixture.nativeElement.querySelector('iframe').src, location.origin)
        expect(src.searchParams.get('ticket')).toBe('test-ticket')
        expect(src.searchParams.get('v')).toBe('1.2.3')
      })

      it('does not reload the iframe when the helper reports ready again', async () => {
        // A reconnect spawns a fresh helper that announces itself, but that
        // helper serves the iframe already on the page - reassigning `src`
        // would throw away whatever the user has typed into it
        await open()
        await ready()
        const first = fixture.nativeElement.querySelector('iframe').src

        await ready()

        expect(fixture.nativeElement.querySelector('iframe').src).toBe(first)
        expect(api.callsTo('post', '/plugins/settings-ui/homebridge-example/ticket')).toHaveLength(1)
      })

      it('says the plugin ui is offline when the ticket cannot be issued', async () => {
        await open({
          arrange: () => api.fail('post', /ticket$/, new Error('helper died')),
        })

        await ready()

        expect(component.loading()).toBe(false)
        expect(toastr.error).toHaveBeenCalledWith('plugins.settings.message_ui_offline', 'toast.title_error')
      })
    })

    /**
     * Making the plugin's own page look like the rest of the UI.
     *
     * ⚠️ **The iframe is a separate document with none of the app's styling.** The
     * theme classes, the parent's stylesheets and its inline styles are all pushed
     * across by message when the plugin page announces itself — otherwise a plugin's
     * settings screen renders as unstyled HTML in the middle of a themed modal.
     */
    describe('styling the plugin page', () => {
      /** Every body-class the plugin page was told to apply. */
      function bodyClasses() {
        return replies().filter(reply => reply?.action === 'body-class').map(reply => reply.class)
      }

      it('sends the current theme across', async () => {
        document.body.classList.add('config-ui-x-teal')
        await open()
        await ready()

        await post({ action: 'loaded' })

        expect(bodyClasses()).toContain('config-ui-x-teal')
        document.body.classList.remove('config-ui-x-teal')
      })

      it('tells it that it is inside a modal', async () => {
        // The theme's own `&.modal-content` rules are what colour the canvas
        await open()
        await ready()

        await post({ action: 'loaded' })

        expect(bodyClasses()).toContain('modal-content')
      })

      it('sends the dark mode class when the app is dark', async () => {
        document.body.classList.add('dark-mode')
        await open()
        await ready()

        await post({ action: 'loaded' })

        expect(bodyClasses()).toContain('dark-mode')
        document.body.classList.remove('dark-mode')
      })

      it('leaves the dark mode class off in light mode', async () => {
        document.body.classList.remove('dark-mode')
        await open()
        await ready()

        await post({ action: 'loaded' })

        expect(bodyClasses()).not.toContain('dark-mode')
      })

      it('passes the parent stylesheets over as absolute urls', async () => {
        // ⚠️ The iframe resolves a relative href against its own url, which is the
        // plugin helper, not the app - so the href has to be made absolute here
        const link = document.createElement('link')
        link.setAttribute('rel', 'stylesheet')
        link.setAttribute('href', '/styles.css')
        document.head.appendChild(link)
        await open()
        await ready()

        await post({ action: 'loaded' })

        const hrefs = replies().filter(reply => reply?.action === 'link-element').map(reply => reply.href)
        expect(hrefs).toContain(`${document.baseURI}styles.css`)
        link.remove()
      })

      it('ignores a link that is not a stylesheet', async () => {
        const link = document.createElement('link')
        link.setAttribute('rel', 'icon')
        link.setAttribute('href', '/favicon.ico')
        document.head.appendChild(link)
        await open()
        await ready()

        await post({ action: 'loaded' })

        const hrefs = replies().filter(reply => reply?.action === 'link-element').map(reply => reply.href)
        expect(hrefs.some((href: string) => href.includes('favicon'))).toBe(false)
        link.remove()
      })

      it('passes the parent inline styles over too', async () => {
        const style = document.createElement('style')
        style.innerHTML = '.from-the-parent { color: red; }'
        document.head.appendChild(style)
        await open()
        await ready()

        await post({ action: 'loaded' })

        const styles = replies().filter(reply => reply?.action === 'inline-style').map(reply => reply.style)
        expect(styles.some((css: string) => css.includes('from-the-parent'))).toBe(true)
        style.remove()
      })

      it('confirms it is ready once the styling has gone across', async () => {
        // The plugin page waits for this before rendering, so it must come after
        await open()
        await ready()

        await post({ action: 'loaded' })

        const actions = replies().map(reply => reply?.action)
        expect(actions).toContain('ready')
        expect(actions.indexOf('ready')).toBeGreaterThan(actions.indexOf('body-class'))
      })
    })

    describe('the guard on incoming messages', () => {
      it('ignores a message from another window', async () => {
        // Any page in any tab can post here.
        //
        // ⚠️ Assert on the foreign window's own postMessage, not on the
        // iframe's. Replies go to `event.source`, so checking the iframe
        // received nothing passes even with the source check removed - the
        // reply would just have gone to the attacker instead.
        await open()
        await ready()
        const foreign = { postMessage: vi.fn() }

        await post({ action: 'config.get', requestId: 'r1' }, { source: foreign })

        expect(foreign.postMessage).not.toHaveBeenCalled()
        expect(lastReply()).toBeUndefined()
      })

      it('ignores a message that claims the right origin from the wrong window', async () => {
        // Origin alone is not enough: an iframe the plugin itself embedded, or
        // any window that can reach this one, could assert the API origin
        await open()
        await ready()
        const foreign = { postMessage: vi.fn() }

        await post({ action: 'config.save', requestId: 'r1' }, { source: foreign })

        expect(foreign.postMessage).not.toHaveBeenCalled()
        expect(api.callsTo('post', /config-editor\/plugin/)).toEqual([])
      })

      it('ignores a message from a foreign origin', async () => {
        await open()
        await ready()

        await post({ action: 'config.get', requestId: 'r1' }, { origin: 'https://not-homebridge.example' })

        expect(lastReply()).toBeUndefined()
      })

      it('answers a message from its own iframe', async () => {
        await open()
        await ready()

        await post({ action: 'config.get', requestId: 'r1' })

        expect(lastReply()).toMatchObject({ requestId: 'r1', success: true })
      })
    })

    describe('reading and writing the config', () => {
      it('hands over the config blocks on request', async () => {
        await open({ pluginConfig: [{ platform: 'Example', name: 'Front Room' }] })
        await ready()

        await post({ action: 'config.get', requestId: 'r1' })

        expect(lastReply()?.data).toEqual([{ platform: 'Example', name: 'Front Room' }])
      })

      it('hands over the schema on request', async () => {
        await open()
        await ready()

        await post({ action: 'config.schema', requestId: 'r1' })

        expect(lastReply()?.data).toMatchObject({ pluginAlias: 'Example' })
      })

      it('answers a save only once it has actually saved', async () => {
        // Replying with the promise itself throws DataCloneError inside
        // postMessage and the acknowledgement is silently dropped (#2869)
        await open({ arrange: () => api.respond('post', /config-editor\/plugin/, { config: [{ platform: 'Example' }], affectedBridges: [] }) })
        await ready()

        await post({ action: 'config.save', requestId: 'r1' })

        expect(api.lastCall('post', /config-editor\/plugin/)).toBeDefined()
        const reply = lastReply()
        expect(reply?.success).toBe(true)
        expect(reply?.data).toEqual(component.pluginConfig)
        expect(reply?.data).not.toBeInstanceOf(Promise)
      })

      it('tells the plugin the save failed rather than leaving it waiting', async () => {
        await open({ arrange: () => api.fail('post', /config-editor\/plugin/, new Error('disk full')) })
        await ready()

        await post({ action: 'config.save', requestId: 'r1' })

        expect(lastReply()).toMatchObject({ requestId: 'r1', success: false })
        expect(lastReply()?.data).toEqual({ message: 'config.failed_to_save_config' })
      })

      it('refuses a config update that is not an array', async () => {
        await open()
        await ready()

        await post({ action: 'config.update', requestId: 'r1', pluginConfig: { platform: 'Example' } })

        expect(lastReply()).toMatchObject({ success: false })
        expect(toastr.error).toHaveBeenCalledWith('plugins.config.must_be_array', 'toast.title_error')
      })

      it('refuses a config update whose entries are not objects', async () => {
        await open()
        await ready()

        await post({ action: 'config.update', requestId: 'r1', pluginConfig: ['not an object'] })

        expect(lastReply()).toMatchObject({ success: false })
        expect(toastr.error).toHaveBeenCalledWith('plugins.config.must_be_array_objects', 'toast.title_error')
      })

      it('refuses a config update whose entries are arrays', async () => {
        // `typeof [] === 'object'`, so this needs its own check
        await open()
        await ready()

        await post({ action: 'config.update', requestId: 'r1', pluginConfig: [[]] })

        expect(lastReply()).toMatchObject({ success: false })
        expect(toastr.error).toHaveBeenCalledWith('plugins.config.must_be_array_objects', 'toast.title_error')
      })

      it('stamps the alias onto every block the plugin sends', async () => {
        // A block without it would not be matched back to this plugin
        await open()
        await ready()

        await post({
          action: 'config.update',
          requestId: 'r1',
          pluginConfig: [{ name: 'One' }, { name: 'Two' }],
        })

        expect(component.pluginConfig).toEqual([
          { platform: 'Example', name: 'One' },
          { platform: 'Example', name: 'Two' },
        ])
      })

      it('stamps an accessory plugin as an accessory', async () => {
        await open({ schema: makeSchema({ pluginType: 'accessory' }), pluginConfig: [] })
        await ready()

        await post({ action: 'config.update', requestId: 'r1', pluginConfig: [{ name: 'One' }] })

        expect(component.pluginConfig[0]).toEqual({ accessory: 'Example', name: 'One' })
      })

      it('merges into the existing block rather than replacing it', async () => {
        // Deliberate: the array and its objects keep their identity so the
        // schema form bound to them is not reset on every plugin update. The
        // side effect is that a key the plugin dropped stays behind
        await open({ pluginConfig: [{ platform: 'Example', name: 'One', legacyOption: true }] })
        await ready()
        const blockBefore = component.pluginConfig[0]

        await post({ action: 'config.update', requestId: 'r1', pluginConfig: [{ name: 'Renamed' }] })

        expect(component.pluginConfig[0]).toBe(blockBefore)
        expect(component.pluginConfig[0]).toEqual({ platform: 'Example', name: 'Renamed', legacyOption: true })
      })

      it('drops blocks the plugin removed', async () => {
        await open({
          pluginConfig: [
            { platform: 'Example', name: 'One' },
            { platform: 'Example', name: 'Two' },
          ],
        })
        await ready()

        await post({ action: 'config.update', requestId: 'r1', pluginConfig: [{ name: 'One' }] })

        expect(component.pluginConfig).toHaveLength(1)
      })
    })

    /**
     * What the plugin's page can ask about the surrounding app.
     *
     * ⚠️ **The iframe is sandboxed from the app**, so the plugin cannot read the
     * user's language or theme for itself. Everything it needs comes through here,
     * and a missing answer leaves a plugin UI in English on a German install.
     */
    describe('what the plugin can read about the app', () => {
      it('tells the plugin which language the user is on', async () => {
        await open()
        await ready()

        await post({ action: 'i18n.lang', requestId: 'r1' })

        expect(lastReply()?.data).toBeDefined()
      })

      it('hands over the whole translation file', async () => {
        // The plugin renders its own labels, so it needs the strings rather than
        // a lookup it would have to ask for one at a time
        await open()
        await ready()

        await post({ action: 'i18n.translations', requestId: 'r1' })

        // The file is flat, keyed by the dotted names the app uses
        expect(lastReply()?.data).toMatchObject({ 'menu.label_settings': expect.any(String) })
      })

      it('falls back to english for a language the app does not ship', async () => {
        // ⚠️ A missing locale file throws on the synchronous require. Without the
        // fallback the whole modal dies rather than showing English labels
        await open()
        await ready()
        vi.spyOn(TestBed.inject(TranslateService), 'getCurrentLang').mockReturnValue('kl')

        await post({ action: 'i18n.translations', requestId: 'r1' })

        expect(lastReply()?.data).toMatchObject({ 'menu.label_settings': expect.any(String) })
      })
    })

    describe('sizing the plugin page', () => {
      it('grows the iframe to fit what the plugin rendered', async () => {
        // ⚠️ The iframe cannot size itself from inside, so the plugin measures its
        // own content and reports it. Left unset, a long form is cut off with no
        // scrollbar of its own
        await open()
        await ready()

        await post({ action: 'scrollHeight', scrollHeight: 640 })

        expect(iframe.style.height).toBe('650px')
      })

      it('counts the page as loaded once it has reported a height', async () => {
        await open()
        await ready()

        await post({ action: 'scrollHeight', scrollHeight: 400 })

        expect(component.uiLoaded()).toBe(true)
      })
    })

    describe('proxying requests to the server helper', () => {
      it('forwards a request over the socket', async () => {
        await open()
        await ready()

        await post({ action: 'request', requestId: 'r1', path: '/do-thing' })

        expect(io.socket.payloadsFor('request')).toEqual([
          { action: 'request', requestId: 'r1', path: '/do-thing' },
        ])
      })

      it('fails fast instead of buffering a request while the socket is down', async () => {
        // socket.io flushes buffered emits before `connect` fires, so a
        // buffered request would reach the new server socket ahead of the
        // `start` that gives it a helper, and nothing would answer it
        await open()
        await ready()
        io.socket.connected = false

        await post({ action: 'request', requestId: 'r1', path: '/do-thing' })

        expect(io.socket.payloadsFor('request')).toEqual([])
        expect(lastReply()).toMatchObject({ requestId: 'r1', success: false })
      })

      it('passes a response from the helper into the iframe', async () => {
        await open()
        await ready()

        io.socket.fire('response', { requestId: 'r1', data: 'hello' })

        expect(pluginWindow.postMessage).toHaveBeenCalledWith(
          { requestId: 'r1', data: 'hello', action: 'response' },
          environment.api.origin,
        )
      })

      it('passes a stream event from the helper into the iframe', async () => {
        await open()
        await ready()

        io.socket.fire('stream', { event: 'progress', data: 42 })

        expect(pluginWindow.postMessage).toHaveBeenCalledWith(
          { event: 'progress', data: 42, action: 'stream' },
          environment.api.origin,
        )
      })
    })

    describe('the cached accessory lists', () => {
      it('gives the plugin only its own hap accessories', async () => {
        await open({
          hapCache: [
            { plugin: 'homebridge-example', displayName: 'Mine' },
            { plugin: 'homebridge-other', displayName: 'Theirs' },
          ],
        })
        await ready()

        await post({ action: 'cachedAccessories.get', requestId: 'r1' })

        expect(lastReply()?.data).toEqual([{ plugin: 'homebridge-example', displayName: 'Mine' }])
      })

      it('gives the plugin only its own matter accessories', async () => {
        await open({
          matterCache: [
            { plugin: 'homebridge-example', displayName: 'Mine' },
            { plugin: 'homebridge-other', displayName: 'Theirs' },
          ],
        })
        await ready()

        await post({ action: 'cachedMatterAccessories.get', requestId: 'r1' })

        expect(lastReply()?.data).toEqual([{ plugin: 'homebridge-example', displayName: 'Mine' }])
      })

      it.each([
        ['hap', 'getHap', 'cachedAccessories.get'],
        ['matter', 'getMatter', 'cachedMatterAccessories.get'],
      ])('toasts rather than throwing when the %s cache is unreachable', async (_case, method, action) => {
        vi.spyOn(console, 'error').mockImplementation(() => {})
        await open()
        await ready()
        ;(accessoryCache as any)[method] = vi.fn(async () => {
          throw new Error('cache down')
        })

        await post({ action, requestId: 'r1' })

        expect(toastr.error).toHaveBeenCalled()
      })
    })

    describe('what the plugin can drive in the surrounding ui', () => {
      it.each([
        ['toast.success', 'success'],
        ['toast.error', 'error'],
        ['toast.warning', 'warning'],
        ['toast.info', 'info'],
      ])('shows a %s toast', async (action, level) => {
        await open()
        await ready()

        await post({ action, message: 'Plugin says hello', title: 'Example' })

        expect((toastr as any)[level]).toHaveBeenCalledWith('Plugin says hello', 'Example')
      })

      it('shows and hides the spinner', async () => {
        await open()
        await ready()

        await post({ action: 'spinner.show' })
        expect(component.pluginSpinner()).toBe(true)

        await post({ action: 'spinner.hide' })
        expect(component.pluginSpinner()).toBe(false)
      })

      it('disables and re-enables the save button', async () => {
        await open()
        await ready()

        await post({ action: 'button.save.disabled' })
        expect(component.saveButtonDisabled()).toBe(true)

        await post({ action: 'button.save.enabled' })
        expect(component.saveButtonDisabled()).toBe(false)
      })

      it('shows and hides the generated schema form', async () => {
        await open()
        await ready()

        await post({ action: 'schema.show' })
        expect(component.showSchemaForm()).toBe(true)

        await post({ action: 'schema.hide' })
        expect(component.showSchemaForm()).toBe(false)
      })

      it('hides the generated form while a custom form is up', async () => {
        // Two forms at once would both write to the same config
        await open()
        await ready()
        await post({ action: 'schema.show' })

        await post({
          action: 'form.create',
          formId: 'pairing',
          schema: { type: 'object' },
          data: { code: '' },
          submitButton: 'Pair',
          cancelButton: 'Back',
        })

        expect(component.showSchemaForm()).toBe(false)
        expect(component.formId()).toBe('pairing')
        expect(component.formSubmitButtonLabel()).toBe('Pair')
        expect(component.formCancelButtonLabel()).toBe('Back')
      })

      it('clears the custom form when the plugin ends it', async () => {
        await open()
        await ready()
        await post({ action: 'form.create', formId: 'pairing', schema: {}, data: {} })

        await post({ action: 'form.end' })
        await new Promise(resolve => setTimeout(resolve, 0))

        expect(component.formId()).toBeUndefined()
        expect(component.formSchema()).toBeUndefined()
      })

      describe('what a custom form sends back', () => {
        /** Put a custom form up, ready to be edited. */
        async function withForm() {
          await open()
          await ready()
          await post({ action: 'form.create', formId: 'pairing', schema: { type: 'object' }, data: { code: '' } })
          pluginWindow.postMessage.mockClear()
        }

        /** Every stream message the plugin page received. */
        function streams() {
          return pluginWindow.postMessage.mock.calls
            .map(call => ({ message: call[0], targetOrigin: call[1] }))
            .filter(entry => entry.message?.action === 'stream')
        }

        it('streams edits back under the form id the plugin chose', async () => {
          // The plugin page matches the reply to its own form by this id
          vi.useFakeTimers()
          await withForm()

          // ⚠️ `skip(1)` sits AFTER the debounce, so what is dropped is the
          // first value to settle - the form reporting the data the plugin
          // just handed it - rather than the first keystroke
          component.formUpdatedSubject.next({ code: '' })
          vi.advanceTimersByTime(200)
          expect(streams()).toEqual([])

          component.formUpdatedSubject.next({ code: '1234' })
          vi.advanceTimersByTime(200)

          expect(streams().map(entry => entry.message)).toEqual([{
            action: 'stream',
            event: 'pairing',
            data: { formEvent: 'change', formData: { code: '1234' } },
          }])
        })

        it('sends only the last edit of a burst of typing', async () => {
          vi.useFakeTimers()
          await withForm()
          // Settle one value first, so the skip above is spent
          component.formUpdatedSubject.next({ code: '' })
          vi.advanceTimersByTime(200)

          component.formUpdatedSubject.next({ code: '1' })
          vi.advanceTimersByTime(50)
          component.formUpdatedSubject.next({ code: '12' })
          vi.advanceTimersByTime(50)
          component.formUpdatedSubject.next({ code: '123' })
          vi.advanceTimersByTime(200)

          expect(streams().map(entry => entry.message.data.formData)).toEqual([{ code: '123' }])
        })

        it.each(['submit', 'cancel'] as const)('tells the plugin page the form was %sed, with what it holds', async (formEvent) => {
          await withForm()
          component.formData.set({ code: '1234' })

          component.formActionSubject.next(formEvent)

          expect(streams().map(entry => entry.message)).toEqual([{
            action: 'stream',
            event: 'pairing',
            data: { formEvent, formData: { code: '1234' } },
          }])
        })

        it('addresses the plugin page rather than any listening window', async () => {
          // A wildcard target origin would hand whatever the user typed into
          // the form - pairing codes, tokens - to any window that got in
          await withForm()

          component.formActionSubject.next('submit')

          expect(streams().map(entry => entry.targetOrigin)).toEqual([environment.api.origin])
        })
      })

      it('reports the lighting mode the user is actually seeing', async () => {
        await open()
        await ready()

        await post({ action: 'user.lightingMode', requestId: 'r1' })

        expect(lastReply()?.data).toBe(settings.actualLightingMode)
      })

      it('closes the modal on request', async () => {
        await open()
        await ready()

        await post({ action: 'close' })

        expect(activeModal.close).toHaveBeenCalled()
      })
    })

    /**
     * Keeping the generated form and the plugin's own page in step.
     *
     * ⚠️ **Both edit the same config, so an echo is easy to create.** The plugin
     * writes a value, the generated form redraws, the redraw looks like a user
     * edit, and the edit is posted straight back to the plugin — which writes it
     * again. The one-shot flag is what breaks that loop.
     */
    describe('keeping the two forms in step', () => {
      /** Let a debounced subject settle. */
      async function settleForms() {
        await vi.advanceTimersByTimeAsync(300)
        await Promise.resolve()
      }

      /** The config changes posted to the plugin's page since the last clear. */
      function echoedConfigChanges() {
        return pluginWindow.postMessage.mock.calls.filter(([message]) => message?.event === 'configChanged')
      }

      beforeEach(() => {
        vi.useFakeTimers()
      })

      afterEach(() => {
        vi.useRealTimers()
      })

      it('tells the plugin when the generated form is edited', async () => {
        await open({ pluginConfig: [{ name: 'Example' }] })
        await ready()
        pluginWindow.postMessage.mockClear()

        // ⚠️ Twice: the first emission is skipped, because the form emits once as
        // it is built and that is not a user edit
        component.schemaFormUpdatedSubject.next({})
        await settleForms()
        component.schemaFormUpdatedSubject.next({})
        await settleForms()

        expect(pluginWindow.postMessage).toHaveBeenCalledWith(
          expect.objectContaining({ action: 'stream', event: 'configChanged' }),
          expect.anything(),
        )
      })

      it('says nothing on the form being built', async () => {
        await open({ pluginConfig: [{ name: 'Example' }] })
        await ready()
        pluginWindow.postMessage.mockClear()

        component.schemaFormUpdatedSubject.next({})
        await settleForms()

        expect(pluginWindow.postMessage).not.toHaveBeenCalled()
      })

      it('does not echo back the redraw the plugin itself caused', async () => {
        // ⚠️ The loop this prevents: plugin writes → form redraws → the redraw looks
        // like a user edit → posted back to the plugin → plugin writes again.
        //
        // ⚠️ The guard is one-shot, so the sequence matters: emit once to get past
        // the skipped build emission, refresh, then emit twice. Only the second of
        // those two may reach the plugin
        await open({ pluginConfig: [{ name: 'Example' }] })
        await ready()
        await post({ action: 'schema.show' })
        component.schemaFormUpdatedSubject.next({})
        await settleForms()

        ;(component as any).schemaFormRefreshSubject.next({})
        await settleForms()
        pluginWindow.postMessage.mockClear()

        component.schemaFormUpdatedSubject.next({})
        await settleForms()
        expect(echoedConfigChanges()).toHaveLength(0)

        component.schemaFormUpdatedSubject.next({})
        await settleForms()
        expect(echoedConfigChanges()).toHaveLength(1)
      })

      it('redraws the generated form when the plugin changes the config', async () => {
        // ⚠️ ng-formworks does not pick up a config replaced underneath it, so the
        // form is taken away and put back. Without it the boxes keep showing what
        // the user typed over what the plugin wrote
        await open({ pluginConfig: [{ name: 'Example' }] })
        await ready()
        await post({ action: 'schema.show' })
        // ⚠️ Watched through the setter rather than the value: the off and the on
        // are one microtask apart, and anything that lets the queue drain - which
        // advancing the timers does - only ever sees it back on
        const setShown = vi.spyOn(component.showSchemaForm, 'set')

        ;(component as any).schemaFormRefreshSubject.next({})
        await settleForms()

        expect(setShown.mock.calls.map(([value]) => value)).toEqual([false, true])
        expect(component.showSchemaForm()).toBe(true)
      })

      it('leaves the generated form alone when it is not being shown', async () => {
        await open({ pluginConfig: [{ name: 'Example' }] })
        await ready()

        ;(component as any).schemaFormRefreshSubject.next({})
        await settleForms()

        expect(component.showSchemaForm()).toBe(false)
      })
    })

    describe('saving from the modal footer', () => {
      it('offers a child bridge the first time a platform plugin is configured', async () => {
        await open({
          pluginConfig: [],
          recommendChildBridges: true,
          arrange: () => api.respond('post', /config-editor\/plugin/, { config: [{ platform: 'Example' }], affectedBridges: [] }),
        })
        await ready()

        await component.savePluginConfig(true)

        expect(activeModal.close).toHaveBeenCalled()
        expect(managePlugins.bridgeSettings).toHaveBeenCalledWith(plugin, true)
        expect(childBridges.openCorrectRestartModalWithBridges).not.toHaveBeenCalled()
      })

      it('goes straight to the restart prompt on a later save', async () => {
        const affectedBridges = [{ identifier: 'bridge-1' }]
        await open({
          recommendChildBridges: true,
          arrange: () => api.respond('post', /config-editor\/plugin/, { config: [{ platform: 'Example' }], affectedBridges }),
        })
        await ready()

        await component.savePluginConfig(true)

        expect(childBridges.openCorrectRestartModalWithBridges).toHaveBeenCalledWith(affectedBridges)
        expect(managePlugins.bridgeSettings).not.toHaveBeenCalled()
      })

      it('does not offer a child bridge when the setting is off', async () => {
        await open({
          pluginConfig: [],
          recommendChildBridges: false,
          arrange: () => api.respond('post', /config-editor\/plugin/, { config: [{ platform: 'Example' }], affectedBridges: [] }),
        })
        await ready()

        await component.savePluginConfig(true)

        expect(managePlugins.bridgeSettings).not.toHaveBeenCalled()
        expect(childBridges.openCorrectRestartModalWithBridges).toHaveBeenCalled()
      })

      it('stays open and toasts when the save fails', async () => {
        await open({ arrange: () => api.fail('post', /config-editor\/plugin/, new Error('disk full')) })
        await ready()

        const saved = await component.savePluginConfig(true)

        expect(saved).toBe(false)
        expect(component.saveInProgress()).toBe(false)
        expect(activeModal.close).not.toHaveBeenCalled()
        expect(toastr.error).toHaveBeenCalledWith('config.failed_to_save_config', 'toast.title_error')
      })

      it('saves without closing when only the save button was pressed', async () => {
        await open({ arrange: () => api.respond('post', /config-editor\/plugin/, { config: [{ platform: 'Example' }], affectedBridges: [] }) })
        await ready()

        await component.savePluginConfig()

        expect(activeModal.close).not.toHaveBeenCalled()
        expect(childBridges.openCorrectRestartModalWithBridges).not.toHaveBeenCalled()
      })
    })

    describe('tearing down', () => {
      it('revokes the asset session when dismissed', async () => {
        await open()
        await ready()

        await component.dismissModal()

        expect(api.lastCall('post', /session\/revoke$/)).toBeDefined()
        expect(activeModal.dismiss).toHaveBeenCalledWith('Dismiss')
      })

      it('revokes the asset session only once', async () => {
        // dismissModal revokes, and so does ngOnDestroy behind it
        await open()
        await ready()

        await component.dismissModal()
        fixture.destroy()
        await settle()

        expect(api.callsTo('post', /session\/revoke$/)).toHaveLength(1)
      })

      it('revokes the asset session on an escape-key dismissal', async () => {
        // ng-bootstrap's own dismissal bypasses the close handlers entirely
        await open()
        await ready()

        fixture.destroy()
        await settle()

        expect(api.callsTo('post', /session\/revoke$/)).toHaveLength(1)
      })

      it('closes anyway when the session cannot be revoked', async () => {
        await open({ arrange: () => api.fail('post', /session\/revoke$/, new Error('server gone')) })
        await ready()

        await component.dismissModal()

        expect(activeModal.dismiss).toHaveBeenCalledWith('Dismiss')
        expect(console.warn).toHaveBeenCalled()
      })

      it('detaches its socket listeners before ending the connection', async () => {
        // The socket is cached and outlives this modal - a listener left behind
        // posts to this instance's destroyed iframe next time (#2873)
        await open()
        await ready()

        fixture.destroy()
        await settle()

        expect(io.socket.handlers('response')).toEqual([])
        expect(io.socket.handlers('stream')).toEqual([])
        expect(io.socket.handlers('ready')).toEqual([])
        expect(io.end).toHaveBeenCalled()
      })

      it('stops listening for messages from the page', async () => {
        await open()
        await ready()
        const before = pluginWindow.postMessage.mock.calls.length

        fixture.destroy()
        await settle()
        await post({ action: 'config.get', requestId: 'r1' })

        expect(pluginWindow.postMessage.mock.calls).toHaveLength(before)
      })
    })
  })

  describe('customPluginsService', () => {
    let service: CustomPluginsService

    class FakeCustomComponent {}

    /**
     * Both entry points await the config fetch before opening, so a single
     * microtask is not enough to reach the `modal.open` call.
     */
    async function settle() {
      for (let tick = 0; tick < 10; tick += 1) {
        await Promise.resolve()
      }
    }

    function create() {
      TestBed.resetTestingModule()
      api = fakeApi().respond('get', /config-editor\/plugin/, [{ platform: 'Example', name: 'Loaded' }])
      modal = modalServiceSpy()

      TestBed.configureTestingModule({
        providers: [
          provideTestTranslate(),
          provideFakes({ api, modal }),
        ],
      })

      service = TestBed.inject(CustomPluginsService)
      return service
    }

    beforeEach(() => {
      create()
    })

    it('opens the component a plugin registered for itself', async () => {
      // homebridge-hue and homebridge-deconz ship their own settings component
      service.plugins['homebridge-example'] = FakeCustomComponent

      void service.openSettings(plugin, makeSchema())
      await settle()

      expect(modal.lastOpened()!.content).toBe(FakeCustomComponent)
      expect(modal.lastOpened()!.options?.backdrop).toBe('static')
      expect(modal.lastOpened()!.options?.size).toBe('lg')
    })

    it('opens the generic iframe host for everything else', async () => {
      void service.openCustomSettingsUi(plugin, makeSchema())
      await settle()

      expect(modal.lastOpened()!.content).toBe(CustomPluginsComponent)
    })

    it('fetches the current config when the caller has none', async () => {
      void service.openCustomSettingsUi(plugin, makeSchema())
      await settle()

      expect(api.lastCall('get')?.url).toBe('/config-editor/plugin/homebridge-example')
      expect(modal.dataFor(CUSTOM_PLUGINS_MODAL_DATA)?.pluginConfig).toEqual([{ platform: 'Example', name: 'Loaded' }])
    })

    it('uses the config the caller already had, without a round trip', async () => {
      // The config editor opens this modal with the blocks it is already editing
      const editorContext = { config: [{ platform: 'Example', name: 'Unsaved edit' }] } as any

      void service.openCustomSettingsUi(plugin, makeSchema(), editorContext)
      await settle()

      expect(api.callsTo('get')).toEqual([])
      expect(modal.dataFor(CUSTOM_PLUGINS_MODAL_DATA)?.pluginConfig).toEqual([{ platform: 'Example', name: 'Unsaved edit' }])
    })

    it('encodes a scoped plugin name in the url', async () => {
      // Otherwise the slash in `@scope/name` is read as a path separator
      void service.openCustomSettingsUi({ name: '@scope/homebridge-example', installedVersion: '1.0.0' } as any, makeSchema())
      await settle()

      expect(api.lastCall('get')?.url).toBe('/config-editor/plugin/%40scope%2Fhomebridge-example')
    })

    it('resolves quietly when the modal is dismissed', async () => {
      const opening = service.openCustomSettingsUi(plugin, makeSchema())
      await settle()
      modal.lastOpened()!.ref.dismiss('Dismiss')

      await expect(opening).resolves.toBeUndefined()
    })
  })
})

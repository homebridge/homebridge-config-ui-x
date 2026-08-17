import type { Plugin } from '@/app/core/plugins/manage-plugins.interfaces'
import type { FakeApi, FakeCache, FakeIoNamespace, FakeModalService, FakeSettings, FakeToastr, FakeWs } from '@/testing'
import type { ComponentFixture } from '@angular/core/testing'

import { NO_ERRORS_SCHEMA } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { provideRouter, Router } from '@angular/router'
import { TranslatePipe } from '@ngx-translate/core'
import { Subject } from 'rxjs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { PluginsCacheService } from '@/app/core/caching/plugins-cache.service'
import { ServerPairingsCacheService } from '@/app/core/caching/server-pairings-cache.service'
import { RestartHomebridgeComponent } from '@/app/core/components/restart-homebridge/restart-homebridge.component'
import { ManagePluginsService } from '@/app/core/plugins/manage-plugins.service'
import { PluginSupportComponent } from '@/app/modules/plugins/plugin-support/plugin-support.component'
import { PluginsComponent } from '@/app/modules/plugins/plugins.component'
import { cacheStub, fakeApi, fakeWs, makeAuth, makeSettings, modalServiceSpy, toastrStub } from '@/testing'
import { provideFakes, provideTestTranslate } from '@/testing/providers'

/**
 * The plugins page.
 *
 * `sortPlugins` is covered on its own in `plugins.component.spec.ts` — this is
 * everything around it, and three parts of it are easy to break quietly:
 *
 * ⚠️ **the metadata is filled in before the grid is published.** Every card reads
 * `isConfigured`, `hasChildBridges` and friends, which are derived here rather than
 * sent by the server. Publishing the list first makes every card flash its "needs
 * setup" icon on each page load.
 *
 * ⚠️ **concurrent loads are deduped.** On a fresh mount the websocket-connected
 * subscriber and the router's NavigationEnd both trigger a load; without sharing
 * the in-flight promise the page does the work twice.
 *
 * ⚠️ **search results hide one of each scoped/unscoped pair.** A plugin that has
 * moved to `@homebridge-plugins/…` appears twice in a search, and which one to show
 * depends on which the user has installed. Showing both offers an install that
 * would clash with what is already there.
 */
describe('the plugins page', () => {
  let api: FakeApi
  let ws: FakeWs
  let io: FakeIoNamespace
  let modal: FakeModalService
  let settings: FakeSettings
  let toastr: FakeToastr
  let pluginsCache: FakeCache<Plugin[]>
  let pairingsCache: FakeCache<any[]>
  let managePlugins: { onPluginListRefresh: Subject<void>, settings: ReturnType<typeof vi.fn> }
  let fixture: ComponentFixture<PluginsComponent>

  /**
   * A plugin as the server reports it.
   * @param name - the plugin name
   * @param overrides - fields to change
   */
  function plugin(name: string, overrides: Partial<Plugin> = {}): Plugin {
    return {
      name,
      displayName: name,
      installedVersion: '1.0.0',
      latestVersion: '1.0.0',
      config: [],
      ...overrides,
    } as Plugin
  }

  /**
   * Build the page.
   * @param options - how to set it up
   * @param options.installed - what the plugins cache holds
   * @param options.env - settings env overrides
   * @param options.admin - whether the signed-in user is an admin
   * @param options.pairings - what the pairings cache holds
   * @param options.url - the current url, for the query-parameter actions
   * @param options.connected - whether the child-bridges socket starts connected
   */
  function create(options: {
    installed?: Plugin[]
    env?: Record<string, any>
    admin?: boolean
    pairings?: any[]
    url?: string
    connected?: boolean
  } = {}) {
    TestBed.resetTestingModule()
    api = fakeApi()
    ws = fakeWs()
    modal = modalServiceSpy()
    toastr = toastrStub()
    settings = makeSettings({ env: { recommendChildBridges: true, ...options.env } })
    pluginsCache = cacheStub<Plugin[]>(options.installed ?? [])
    pairingsCache = cacheStub<any[]>(options.pairings ?? [])
    managePlugins = { onPluginListRefresh: new Subject<void>(), settings: vi.fn() }

    io = ws.namespace('child-bridges', { connected: options.connected ?? true })
    io.socket.respondTo('get-homebridge-child-bridge-status', [])

    TestBed.configureTestingModule({
      imports: [PluginsComponent],
      providers: [
        provideRouter([]),
        provideTestTranslate(),
        provideFakes({
          api,
          ws,
          modal,
          settings,
          toastr,
          auth: makeAuth({ user: { username: 'admin', admin: options.admin ?? true } }),
        }),
        { provide: PluginsCacheService, useValue: pluginsCache },
        { provide: ServerPairingsCacheService, useValue: pairingsCache },
        { provide: ManagePluginsService, useValue: managePlugins },
      ],
    })

    TestBed.overrideComponent(PluginsComponent, {
      set: { imports: [TranslatePipe], schemas: [NO_ERRORS_SCHEMA] },
    })

    const router = TestBed.inject(Router)
    if (options.url) {
      vi.spyOn(router, 'url', 'get').mockReturnValue(options.url)
    }
    vi.spyOn(router, 'navigate').mockResolvedValue(true)

    fixture = TestBed.createComponent(PluginsComponent)
    fixture.detectChanges()
    return fixture.componentInstance
  }

  /** Let the page's loads settle. */
  async function settle() {
    for (let tick = 0; tick < 20; tick += 1) {
      await Promise.resolve()
    }
  }

  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.mocked(console.error).mockClear()
    document.body.className = ''
  })

  afterEach(() => {
    vi.useRealTimers()
    document.body.className = ''
  })

  describe('loading the installed plugins', () => {
    it('sets the page title', () => {
      create()

      expect(settings.setPageTitle).toHaveBeenCalledWith('menu.label_plugins')
    })

    it('shows what is installed', async () => {
      create({ installed: [plugin('homebridge-example')] })
      const page = fixture.componentInstance
      await settle()

      expect(page.installedPlugins().map(p => p.name)).toEqual(['homebridge-example'])
      expect(page.loading()).toBe(false)
    })

    it('never lists itself', async () => {
      // The UI cannot be managed from its own plugin card
      const page = create({ installed: [plugin('homebridge-config-ui-x'), plugin('homebridge-example')] })
      await settle()

      expect(page.installedPlugins().map(p => p.name)).toEqual(['homebridge-example'])
    })

    it('does the work once when both triggers fire on a fresh mount', async () => {
      // ⚠️ The websocket-connected subscriber and the router both ask for a load
      const page = create({ installed: [plugin('homebridge-example')] })
      // Let the mount's own load finish first, or these two just join that one
      // and the test passes without proving anything
      await settle()
      pluginsCache.get.mockClear()

      void (page as any).loadInstalledPlugins()
      void (page as any).loadInstalledPlugins()
      await settle()

      expect(pluginsCache.get).toHaveBeenCalledTimes(1)
    })

    it('loads again once the first load has finished', async () => {
      const page = create({ installed: [plugin('homebridge-example')] })
      await settle()
      pluginsCache.get.mockClear()

      await (page as any).loadInstalledPlugins()
      await (page as any).loadInstalledPlugins()

      expect(pluginsCache.get).toHaveBeenCalledTimes(2)
    })

    it('reloads when the plugin service says the list changed', async () => {
      const page = create({ installed: [plugin('homebridge-example')] })
      await settle()
      pluginsCache.get.mockClear()

      managePlugins.onPluginListRefresh.next()
      await settle()

      expect(pluginsCache.get).toHaveBeenCalled()
      expect(page).toBeDefined()
    })

    it('says so when the list cannot be loaded', async () => {
      // The page is otherwise an empty grid that looks like "no plugins"
      const page = create()
      await settle()
      pluginsCache.get.mockRejectedValue(new Error('server unavailable'))

      await (page as any).loadInstalledPlugins()

      expect(page.mainError()).toBe(true)
      expect(page.loading()).toBe(false)
      expect(toastr.error).toHaveBeenCalled()
    })

    it('clears the error on a load that works', async () => {
      const page = create({ installed: [plugin('homebridge-example')] })
      await settle()
      page.mainError.set(true)

      await (page as any).loadInstalledPlugins()

      expect(page.mainError()).toBe(false)
    })

    it('leaves search mode when the installed list is loaded', async () => {
      // The router and websocket subscribers do not clear the flag themselves
      const page = create({ installed: [plugin('homebridge-example')] })
      await settle()
      page.isSearchMode.set(true)

      await (page as any).loadInstalledPlugins()

      expect(page.isSearchMode()).toBe(false)
      expect(page.showExitButton()).toBe(false)
    })
  })

  describe('the metadata each card reads', () => {
    /**
     * Load one plugin and hand back what the page derived about it.
     * @param overrides - the plugin as the server reports it
     * @param options - page setup
     * @param options.env - settings env overrides
     * @param options.admin - whether the user is an admin
     * @param options.pairings - the pairings cache contents
     * @param options.bridges - the child bridges the socket reports
     */
    async function metaFor(
      overrides: Partial<Plugin>,
      options: { env?: Record<string, any>, admin?: boolean, pairings?: any[], bridges?: any[] } = {},
    ): Promise<Plugin> {
      const page = create({ installed: [plugin('homebridge-example', overrides)], ...options })
      if (options.bridges) {
        page.childBridges.set(options.bridges)
        await (page as any).loadInstalledPlugins()
      }
      await settle()
      return page.installedPlugins()[0]
    }

    /**
     * Every non-empty list the page published, as the `isConfigured` of each
     * plugin in it stood at that moment.
     *
     * ⚠️ This is the only way to catch the ordering: by the time a test can read
     * the signal, the metadata is there either way. The mistake it guards against
     * is publishing the list *first* and filling the metadata in afterwards,
     * which flashes the "needs setup" icon on every card on every page load.
     * @param page - the page under test
     */
    function publishedStates(page: PluginsComponent): boolean[][] {
      const snapshots: boolean[][] = []
      const signal = page.installedPlugins as any
      const realSet = signal.set.bind(signal)
      vi.spyOn(signal, 'set').mockImplementation((value: any) => {
        if (value.length) {
          snapshots.push(value.map((p: Plugin) => p.isConfigured))
        }
        realSet(value)
      })
      return snapshots
    }

    it('fills in the metadata before it publishes the grid', async () => {
      const page = create({ installed: [plugin('homebridge-example', { config: [{ platform: 'Example' }] })] })
      await settle()
      // ⚠️ A fresh object for the second load. The metadata is derived onto the
      // plugin objects themselves, so re-using the ones the mount already
      // annotated makes this pass whatever the ordering is
      pluginsCache.setValue([plugin('homebridge-example', { config: [{ platform: 'Example' }] })])
      const published = publishedStates(page)

      await (page as any).loadInstalledPlugins()

      expect(published.length).toBeGreaterThan(0)
      for (const states of published) {
        expect(states).not.toContain(undefined)
      }
    })

    it('does the same for search results', async () => {
      // Same trap, second code path
      const page = create()
      await settle()
      api.respond('get', /plugins\/search/, [plugin('homebridge-hue', { config: [{ platform: 'Hue' }] })])
      const published = publishedStates(page)

      await page.search()

      expect(published.length).toBeGreaterThan(0)
      for (const states of published) {
        expect(states).not.toContain(undefined)
      }
    })

    it('calls a plugin with a config block configured', async () => {
      expect((await metaFor({ config: [{ platform: 'Example' }] })).isConfigured).toBe(true)
    })

    it('calls a plugin with no config block unconfigured', async () => {
      expect((await metaFor({ config: [] })).isConfigured).toBe(false)
    })

    it('notices a configured dynamic platform', async () => {
      // Which decides whether uninstalling has to offer to remove accessories
      expect((await metaFor({ config: [{ platform: 'Example' }] })).isConfiguredDynamicPlatform).toBe(true)
    })

    it('does not call an accessory block a dynamic platform', async () => {
      expect((await metaFor({ config: [{ accessory: 'Example' }] })).isConfiguredDynamicPlatform).toBe(false)
    })

    it('sees the child bridge a config block runs on', async () => {
      const config = [{ platform: 'Example', _bridge: { username: '0E:11:22:33:44:55' } }]

      expect((await metaFor({ config })).hasChildBridges).toBe(true)
    })

    it('does not count a bridge block with no username', async () => {
      // Half-written config, and it would suppress the setup nudge for nothing
      expect((await metaFor({ config: [{ platform: 'Example', _bridge: {} }] })).hasChildBridges).toBe(false)
    })

    it('nudges a configured plugin towards a child bridge', async () => {
      expect((await metaFor({ config: [{ platform: 'Example' }] })).recommendChildBridge).toBe(true)
    })

    it('does not nudge an unconfigured plugin', async () => {
      expect((await metaFor({ config: [] })).recommendChildBridge).toBe(false)
    })

    it('does not nudge when the user switched recommendations off', async () => {
      const meta = await metaFor({ config: [{ platform: 'Example' }] }, { env: { recommendChildBridges: false } })

      expect(meta.recommendChildBridge).toBe(false)
    })

    it('does not nudge a plugin the user opted out of', async () => {
      const meta = await metaFor(
        { config: [{ platform: 'Example' }] },
        { env: { plugins: { hideChildBridgeSetupFor: ['homebridge-example'] } } },
      )

      expect(meta.recommendChildBridge).toBe(false)
    })

    it('hides an update the user asked not to see', async () => {
      const meta = await metaFor(
        { updateAvailable: true },
        { env: { plugins: { hideUpdatesFor: ['homebridge-example'] } } },
      )

      expect(meta.updateAvailable).toBe(false)
    })

    it('leaves an update alone for a plugin not on that list', async () => {
      const meta = await metaFor({ updateAvailable: true }, { env: { plugins: { hideUpdatesFor: ['homebridge-other'] } } })

      expect(meta.updateAvailable).toBe(true)
    })

    it('derives nothing for a plugin that is not installed', async () => {
      // Search results include plugins the user does not have
      const meta = await metaFor({ installedVersion: undefined as any })

      expect(meta.isConfigured).toBeUndefined()
    })

    it('derives nothing at all for a non-admin', async () => {
      // A non-admin cannot read the config, so the calls would 403
      const meta = await metaFor({ config: [{ platform: 'Example' }] }, { admin: false })

      expect(meta.isConfigured).toBeUndefined()
    })

    it('assumes the safe answers when deriving throws', async () => {
      // A malformed config block would otherwise leave the whole grid unrendered
      const meta = await metaFor({ config: [null as any] })

      expect(meta.isConfigured).toBe(true)
      expect(meta.hasChildBridges).toBe(true)
      expect(console.error).toHaveBeenCalled()
    })

    describe('the unpaired bridge warning', () => {
      const bridge = (overrides: Record<string, any> = {}) => ({
        plugin: 'homebridge-example',
        username: '0E:11:22:33:44:55',
        paired: true,
        ...overrides,
      })

      it('flags an unpaired hap bridge', async () => {
        const meta = await metaFor({ config: [{ platform: 'Example' }] }, { bridges: [bridge({ paired: false })] })

        expect(meta.hasChildBridgesUnpaired).toBe(true)
      })

      it('flags an uncommissioned matter bridge', async () => {
        const meta = await metaFor(
          { config: [{ platform: 'Example' }] },
          { bridges: [bridge({ matterConfig: {}, matterCommissioned: false })] },
        )

        expect(meta.hasChildBridgesUnpaired).toBe(true)
      })

      it('says nothing about a bridge that is paired', async () => {
        const meta = await metaFor({ config: [{ platform: 'Example' }] }, { bridges: [bridge()] })

        expect(meta.hasChildBridgesUnpaired).toBe(false)
      })

      it('respects a hidden hap warning', async () => {
        const meta = await metaFor({ config: [{ platform: 'Example' }] }, {
          bridges: [bridge({ paired: false })],
          env: { bridges: [{ username: '0E:11:22:33:44:55', hideHapAlert: true }] },
        })

        expect(meta.hasChildBridgesUnpaired).toBe(false)
      })

      it('respects a hidden matter warning', async () => {
        const meta = await metaFor({ config: [{ platform: 'Example' }] }, {
          bridges: [bridge({ matterConfig: {}, matterCommissioned: false })],
          env: { bridges: [{ username: '0E:11:22:33:44:55', hideMatterAlert: true }] },
        })

        expect(meta.hasChildBridgesUnpaired).toBe(false)
      })

      it('matches the bridge whatever case its username is written in', async () => {
        // The config file and the running bridge do not always agree
        const meta = await metaFor({ config: [{ platform: 'Example' }] }, {
          bridges: [bridge({ paired: false })],
          env: { bridges: [{ username: '0e:11:22:33:44:55', hideHapAlert: true }] },
        })

        expect(meta.hasChildBridgesUnpaired).toBe(false)
      })

      it('does not silence the hap warning with a hidden matter one', async () => {
        const meta = await metaFor({ config: [{ platform: 'Example' }] }, {
          bridges: [bridge({ paired: false })],
          env: { bridges: [{ username: '0E:11:22:33:44:55', hideMatterAlert: true }] },
        })

        expect(meta.hasChildBridgesUnpaired).toBe(true)
      })

      it('ignores the bridges of other plugins', async () => {
        const meta = await metaFor({ config: [{ platform: 'Example' }] }, {
          bridges: [bridge({ plugin: 'homebridge-other', paired: false })],
        })

        expect(meta.hasChildBridgesUnpaired).toBe(false)
      })
    })

    describe('external accessories', () => {
      it('flags a plugin publishing its own accessories', async () => {
        const meta = await metaFor({ config: [{ platform: 'Example' }] }, {
          env: { featureFlags: { externalAccessoriesAttribution: true } },
          pairings: [{ _plugin: 'homebridge-example', _isExternal: true }],
        })

        expect(meta.hasExternalAccessories).toBe(true)
      })

      it('flags a matter-only pairing the same way', async () => {
        const meta = await metaFor({ config: [{ platform: 'Example' }] }, {
          env: { featureFlags: { externalAccessoriesAttribution: true } },
          pairings: [{ _plugin: 'homebridge-example', _matterOnly: true }],
        })

        expect(meta.hasExternalAccessories).toBe(true)
      })

      it('ignores an ordinary bridged pairing', async () => {
        const meta = await metaFor({ config: [{ platform: 'Example' }] }, {
          env: { featureFlags: { externalAccessoriesAttribution: true } },
          pairings: [{ _plugin: 'homebridge-example' }],
        })

        expect(meta.hasExternalAccessories).toBe(false)
      })

      it('does not ask for the pairings while the feature is off', async () => {
        const meta = await metaFor({ config: [{ platform: 'Example' }] }, {
          pairings: [{ _plugin: 'homebridge-example', _isExternal: true }],
        })

        expect(meta.hasExternalAccessories).toBe(false)
        expect(pairingsCache.get).not.toHaveBeenCalled()
      })

      it('carries on when the pairings cannot be read', async () => {
        const page = create({
          installed: [plugin('homebridge-example', { config: [{ platform: 'Example' }] })],
          env: { featureFlags: { externalAccessoriesAttribution: true } },
        })
        pairingsCache.get.mockRejectedValue(new Error('server unavailable'))

        await (page as any).loadInstalledPlugins()

        expect(page.installedPlugins()[0].hasExternalAccessories).toBe(false)
        expect(page.mainError()).toBe(false)
      })
    })
  })

  describe('searching', () => {
    it('asks the server for the query', async () => {
      const page = create()
      api.respond('get', /plugins\/search/, [])
      page.form.setValue({ query: 'hue' })

      await page.search()

      expect(api.lastCall('get')?.url).toBe('/plugins/search/hue')
    })

    it('url-encodes a query with a slash in it', async () => {
      // Searching for a scoped plugin by its full name
      const page = create()
      api.respond('get', /plugins\/search/, [])
      page.form.setValue({ query: '@homebridge-plugins/homebridge-hue' })

      await page.search()

      expect(api.lastCall('get')?.url).toBe('/plugins/search/%40homebridge-plugins%2Fhomebridge-hue')
    })

    it('shows what came back', async () => {
      const page = create()
      api.respond('get', /plugins\/search/, [plugin('homebridge-hue', { installedVersion: undefined as any })])
      page.form.setValue({ query: 'hue' })

      await page.search()

      expect(page.installedPlugins().map(p => p.name)).toEqual(['homebridge-hue'])
      expect(page.loading()).toBe(false)
    })

    it('never offers itself in the results', async () => {
      const page = create()
      api.respond('get', /plugins\/search/, [plugin('homebridge-config-ui-x'), plugin('homebridge-hue')])
      page.form.setValue({ query: 'homebridge' })

      await page.search()

      expect(page.installedPlugins().map(p => p.name)).toEqual(['homebridge-hue'])
    })

    it('offers a way back out of the results', async () => {
      const page = create()
      api.respond('get', /plugins\/search/, [])

      await page.search()

      expect(page.showExitButton()).toBe(true)
    })

    it('goes back to the installed list when the search fails', async () => {
      const page = create({ installed: [plugin('homebridge-example')] })
      api.fail('get', /plugins\/search/, new Error('npm registry unreachable'))
      page.form.setValue({ query: 'hue' })

      await page.search()
      await settle()

      expect(page.isSearchMode()).toBe(false)
      expect(toastr.error).toHaveBeenCalled()
      expect(page.installedPlugins().map(p => p.name)).toEqual(['homebridge-example'])
    })

    describe('a plugin that has moved to the homebridge scope', () => {
      /** The two names the same plugin can go by. */
      const unscoped = (overrides: Partial<Plugin> = {}) => plugin('homebridge-foo', {
        installedVersion: undefined as any,
        newHbScope: { to: '@homebridge-plugins/homebridge-foo' } as any,
        ...overrides,
      })
      const scoped = (overrides: Partial<Plugin> = {}) => plugin('@homebridge-plugins/homebridge-foo', {
        installedVersion: undefined as any,
        ...overrides,
      })

      /**
       * Search and return the names shown.
       * @param results - what the server returns
       */
      async function namesFor(results: Plugin[]) {
        const page = create()
        api.respond('get', /plugins\/search/, results)
        page.form.setValue({ query: 'foo' })
        await page.search()
        return page.installedPlugins().map(p => p.name)
      }

      it('shows only the scoped one when neither is installed', async () => {
        // The scoped name is where the plugin lives now
        expect(await namesFor([unscoped(), scoped()])).toEqual(['@homebridge-plugins/homebridge-foo'])
      })

      it('shows the unscoped one when that is what the user has', async () => {
        // Offering the scoped copy would install a second, clashing plugin
        expect(await namesFor([unscoped({ installedVersion: '1.0.0' }), scoped()])).toEqual(['homebridge-foo'])
      })

      it('shows the unscoped one when the scoped name is not in the results', async () => {
        // Nothing better to offer
        expect(await namesFor([unscoped()])).toEqual(['homebridge-foo'])
      })

      it('leaves a plugin that has not moved alone', async () => {
        expect(await namesFor([plugin('homebridge-other', { installedVersion: undefined as any })]))
          .toEqual(['homebridge-other'])
      })
    })
  })

  describe('the search bar', () => {
    it('opens on the search button', async () => {
      vi.useFakeTimers()
      const page = create({ installed: [plugin('homebridge-example')] })

      page.showSearch()

      expect(page.showSearchBar()).toBe(true)
    })

    it('leaves the stats tab when it opens', () => {
      const page = create({ installed: [plugin('homebridge-example')] })
      page.tab.set('stats')

      page.showSearch()

      expect(page.tab()).toBe('main')
    })

    it('closes again on a second press', () => {
      const page = create({ installed: [plugin('homebridge-example')] })
      page.showSearch()

      page.showSearch()

      expect(page.showSearchBar()).toBe(false)
    })

    it('goes back to the installed list when closed while showing results', async () => {
      const page = create({ installed: [plugin('homebridge-example')] })
      page.showSearch()
      page.isSearchMode.set(true)
      page.form.setValue({ query: 'hue' })

      page.showSearch()
      await settle()

      expect(page.isSearchMode()).toBe(false)
      expect(page.form.value.query).toBe('')
    })

    it('searches on submit', async () => {
      const page = create()
      api.respond('get', /plugins\/search/, [])

      page.onSubmit({ value: { query: 'hue' } })
      await settle()

      expect(page.isSearchMode()).toBe(true)
      expect(api.callsTo('get', /plugins\/search/)).toHaveLength(1)
    })

    it('closes the bar on an empty submit', async () => {
      const page = create({ installed: [plugin('homebridge-example')] })
      page.showSearch()

      page.onSubmit({ value: { query: '' } })
      await settle()

      expect(page.showSearchBar()).toBe(false)
      expect(api.callsTo('get', /plugins\/search/)).toEqual([])
    })

    it('goes back to the installed list on an empty submit while showing results', async () => {
      const page = create({ installed: [plugin('homebridge-example')] })
      page.isSearchMode.set(true)

      page.onSubmit({ value: { query: '' } })
      await settle()

      expect(page.isSearchMode()).toBe(false)
      expect(page.installedPlugins().map(p => p.name)).toEqual(['homebridge-example'])
    })

    it('clears the box and goes back on the clear button', async () => {
      const page = create({ installed: [plugin('homebridge-example')] })
      page.isSearchMode.set(true)
      page.form.setValue({ query: 'hue' })

      page.onClearSearch()
      await settle()

      expect(page.form.value.query).toBe('')
      expect(page.showExitButton()).toBe(false)
      expect(page.isSearchMode()).toBe(false)
    })

    it('does not reload when clearing a box that was not searched', async () => {
      const page = create({ installed: [plugin('homebridge-example')] })
      await settle()
      pluginsCache.get.mockClear()

      page.onClearSearch()
      await settle()

      expect(pluginsCache.get).not.toHaveBeenCalled()
    })
  })

  describe('what the child bridge socket reports', () => {
    it('asks to be told about status changes', async () => {
      create()
      await settle()

      expect(io.socket.emitted.map(e => e.event)).toContain('monitor-child-bridge-status')
    })

    it('takes the bridge list from the server', async () => {
      io = fakeWs().namespace('child-bridges')
      const page = create()
      io.socket.respondTo('get-homebridge-child-bridge-status', [{ username: 'A', plugin: 'homebridge-example' }])
      ;(page as any).getChildBridgeMetadata()
      await settle()

      expect(page.childBridges().map(b => b.username)).toEqual(['A'])
    })

    it('adds a bridge it has not seen before', () => {
      const page = create()

      io.socket.fire('child-bridge-status-update', { username: 'B', plugin: 'homebridge-example' })

      expect(page.childBridges().map(b => b.username)).toEqual(['B'])
    })

    it('updates one it already knows rather than duplicating it', () => {
      const page = create()
      page.childBridges.set([{ username: 'B', plugin: 'homebridge-example', status: 'up' } as any])

      io.socket.fire('child-bridge-status-update', { username: 'B', status: 'down' })

      expect(page.childBridges()).toHaveLength(1)
      expect(page.childBridges()[0].status).toBe('down')
    })

    it('publishes a new array, so the cards re-render', () => {
      // Mutating the object in place would leave the grid showing the old status
      const page = create()
      page.childBridges.set([{ username: 'B', plugin: 'homebridge-example', status: 'up' } as any])
      const before = page.childBridges()

      io.socket.fire('child-bridge-status-update', { username: 'B', status: 'down' })

      expect(page.childBridges()).not.toBe(before)
    })

    it('gives a plugin only its own bridges', () => {
      const page = create()
      page.childBridges.set([
        { username: 'A', plugin: 'homebridge-example' } as any,
        { username: 'B', plugin: 'homebridge-other' } as any,
      ])

      expect(page.getPluginChildBridges(plugin('homebridge-example')).map(b => b.username)).toEqual(['A'])
    })

    it('closes the socket when the page is left', () => {
      create()

      fixture.destroy()

      expect(io.end).toHaveBeenCalled()
    })
  })

  describe('arriving straight from an install', () => {
    it('asks for a restart when the new plugin has config', async () => {
      create({
        installed: [plugin('homebridge-example', { config: [{ platform: 'Example' }] })],
        url: '/plugins?action=just-installed&plugin=homebridge-example',
      })
      await settle()

      expect(modal.opened.map(m => m.content)).toContain(RestartHomebridgeComponent)
    })

    it('opens the settings when it does not', async () => {
      create({
        installed: [plugin('homebridge-example', { config: [] })],
        url: '/plugins?action=just-installed&plugin=homebridge-example',
      })
      await settle()

      expect(managePlugins.settings).toHaveBeenCalled()
    })

    it('does nothing for a plugin that is not installed after all', async () => {
      create({
        installed: [plugin('homebridge-example')],
        url: '/plugins?action=just-installed&plugin=homebridge-missing',
      })
      await settle()

      expect(modal.opened).toEqual([])
      expect(managePlugins.settings).not.toHaveBeenCalled()
    })

    it('clears the query parameters, so a refresh does not repeat it', async () => {
      const router = TestBed.inject(Router)
      create({
        installed: [plugin('homebridge-example', { config: [] })],
        url: '/plugins?action=just-installed&plugin=homebridge-example',
      })
      await settle()

      expect(vi.mocked(TestBed.inject(Router).navigate)).toHaveBeenCalledWith([], expect.objectContaining({ replaceUrl: true }))
      expect(router).toBeDefined()
    })

    it('does nothing at all without an action', async () => {
      create({ installed: [plugin('homebridge-example')], url: '/plugins' })
      await settle()

      expect(vi.mocked(TestBed.inject(Router).navigate)).not.toHaveBeenCalled()
    })

    it('opens the search bar when nothing is installed', async () => {
      // A brand new install: an empty grid with no way forward would be a dead end
      const page = create({ installed: [] })
      await settle()

      expect(page.showSearchBar()).toBe(true)
    })

    it('leaves the search bar closed when there is something to show', async () => {
      const page = create({ installed: [plugin('homebridge-example')] })
      await settle()

      expect(page.showSearchBar()).toBe(false)
    })
  })

  describe('the stats tab', () => {
    it('paints the page black behind the stats', () => {
      const page = create({ installed: [plugin('homebridge-example')] })

      page.showStats()

      expect(page.tab()).toBe('stats')
      expect(document.body.classList.contains('bg-black')).toBe(true)
    })

    it('closes the search bar when it opens', () => {
      const page = create({ installed: [plugin('homebridge-example')] })
      page.showSearchBar.set(true)

      page.showStats()

      expect(page.showSearchBar()).toBe(false)
    })

    it('goes straight back in dark mode', () => {
      // Nothing to fade: the page is already dark
      const page = create({ installed: [plugin('homebridge-example')] })
      settings.actualLightingMode = 'dark'
      page.showStats()

      page.showStats()

      expect(page.tab()).toBe('main')
      expect(document.body.classList.contains('bg-black')).toBe(false)
    })

    it('fades out before going back in light mode', async () => {
      vi.useFakeTimers()
      const page = create({ installed: [plugin('homebridge-example')] })
      settings.actualLightingMode = 'light'
      page.showStats()

      page.showStats()
      expect(page.tab()).toBe('stats')

      await vi.advanceTimersByTimeAsync(500)
      expect(page.tab()).toBe('main')
      expect(document.body.classList.contains('bg-black')).toBe(false)
    })

    it('cleans the light mode class off the body when the page is left', () => {
      create({ installed: [plugin('homebridge-example')] })
      settings.actualLightingMode = 'light'
      document.body.classList.add('light-mode')

      fixture.destroy()

      expect(document.body.classList.contains('light-mode')).toBe(false)
    })
  })

  describe('leaving the page', () => {
    it('leaves at once from the plugin grid', () => {
      const page = create({ installed: [plugin('homebridge-example')] })

      expect(page.canDeactivate()).toBe(true)
    })

    it('leaves at once from the stats tab in dark mode', async () => {
      const page = create({ installed: [plugin('homebridge-example')] })
      settings.actualLightingMode = 'dark'
      page.showStats()

      await expect(page.canDeactivate()).resolves.toBe(true)
      expect(document.body.classList.contains('bg-black')).toBe(false)
    })

    it('fades out first in light mode', async () => {
      vi.useFakeTimers()
      const page = create({ installed: [plugin('homebridge-example')] })
      settings.actualLightingMode = 'light'
      page.showStats()

      const leaving = page.canDeactivate('/accessories')
      let left = false
      void Promise.resolve(leaving).then(() => {
        left = true
      })

      await vi.advanceTimersByTimeAsync(250)
      expect(left).toBe(false)

      await vi.advanceTimersByTimeAsync(250)
      expect(left).toBe(true)
    })

    it('keeps the black background when the next page is black too', async () => {
      // The terminal and the log page are both black; flashing white between
      // them looks like a page fault
      vi.useFakeTimers()
      const page = create({ installed: [plugin('homebridge-example')] })
      settings.actualLightingMode = 'light'
      page.showStats()

      void page.canDeactivate('/platform-tools/terminal')
      await vi.advanceTimersByTimeAsync(250)

      expect(document.body.classList.contains('bg-black')).toBe(true)
    })

    it('does the same for the log page', async () => {
      vi.useFakeTimers()
      const page = create({ installed: [plugin('homebridge-example')] })
      settings.actualLightingMode = 'light'
      page.showStats()

      void page.canDeactivate('/logs')
      await vi.advanceTimersByTimeAsync(250)

      expect(document.body.classList.contains('bg-black')).toBe(true)
    })
  })

  describe('the support panel', () => {
    it('opens it', () => {
      const page = create({ installed: [plugin('homebridge-example')] })

      page.openSupport()

      expect(modal.lastOpened()!.content).toBe(PluginSupportComponent)
      expect(modal.lastOpened()!.options).toMatchObject({ size: 'lg', backdrop: 'static' })
    })
  })

  describe('who is signed in', () => {
    it('knows an admin is an admin', () => {
      expect(create({ admin: true }).isAdmin).toBe(true)
    })

    it('knows a non-admin is not', () => {
      expect(create({ admin: false }).isAdmin).toBe(false)
    })
  })
})

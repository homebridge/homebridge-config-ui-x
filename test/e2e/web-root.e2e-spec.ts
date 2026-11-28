import type { NestFastifyApplication } from '@nestjs/platform-fastify'
import type { TestingModule } from '@nestjs/testing'
import type { AddressInfo } from 'node:net'

import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import process from 'node:process'

import { NotFoundException } from '@nestjs/common'
import { FastifyAdapter } from '@nestjs/platform-fastify'
import { Test } from '@nestjs/testing'
import { copy, ensureDir, readJson, remove, writeJson } from 'fs-extra'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { AppModule } from '../../src/app.module.js'
import { ConfigService } from '../../src/core/config/config.service.js'
import { getStartupConfig } from '../../src/core/config/config.startup.js'
import { SpaFilter } from '../../src/core/spa/spa.filter.js'
import { normalizeWebRoot, serveUnderWebRoot, setBaseHref, stripWebRoot } from '../../src/core/web-root.js'

import '../../src/global-defaults.js'

describe('the web root setting', () => {
  describe('reading the value from the config', () => {
    it.each([
      ['/homebridge', '/homebridge'],
      ['homebridge', '/homebridge'],
      ['/homebridge/', '/homebridge'],
      ['  /homebridge  ', '/homebridge'],
      ['/home/hb-ui_1.2~x', '/home/hb-ui_1.2~x'],
    ])('reads %j as %j', (value, expected) => {
      expect(normalizeWebRoot(value)).toBe(expected)
    })

    it.each([
      ['nothing', undefined],
      ['an empty text', ''],
      ['the root itself', '/'],
      ['a number', 8581],
      [
        'a list',
        ['/homebridge'],
      ],
    ])('reads %s as no web root', (_case, value) => {
      expect(normalizeWebRoot(value)).toBe('')
    })

    it.each([
      ['a space', '/home bridge'],
      ['an empty part', '/home//bridge'],
      ['a parent folder part', '/home/../bridge'],
      ['a part that is only dots', '/./homebridge'],
      ['html', '/"><script>alert(1)</script>'],
      ['a cookie attribute', '/hb; Domain=example.com'],
      ['a full address', 'https://example.com/homebridge'],
      ['a query', '/homebridge?x=1'],
      ['a new line', '/homebridge\n/x'],
      ['a percent code', '/home%2Fbridge'],
      ['more than 100 characters', `/${'a'.repeat(100)}`],
    ])('refuses a value with %s', (_case, value) => {
      expect(normalizeWebRoot(value)).toBe('')
    })

    // The server itself answers on these paths. Under one of them the root address would stop working, which the
    // packages (health checks, hb-service status) rely on
    it.each([
      '/api',
      '/assets',
      '/media',
      '/socket.io',
      '/swagger',
      '/api/homebridge',
      '/Assets',
    ])('refuses %s, which the server uses itself', (value) => {
      expect(normalizeWebRoot(value)).toBe('')
    })
  })

  describe('taking the web root off an address', () => {
    it.each([
      ['/homebridge', '/'],
      ['/homebridge/', '/'],
      ['/homebridge/api/auth/settings', '/api/auth/settings'],
      ['/homebridge/plugins?q=hue', '/plugins?q=hue'],
      ['/homebridge?q=hue', '/?q=hue'],
      ['/homebridge/homebridge/x', '/homebridge/x'],
    ])('reads %s as %s', (url, expected) => {
      expect(stripWebRoot(url, '/homebridge')).toBe(expected)
    })

    it.each([
      '/',
      '/api/auth/settings',
      '/homebridges/api',
      '/homebridge-x',
      '/x/homebridge/api',
    ])('leaves %s alone, which is how the root address keeps working', (url) => {
      expect(stripWebRoot(url, '/homebridge')).toBe(url)
    })

    it('leaves every address alone when there is no web root', () => {
      expect(stripWebRoot('/homebridge/api', '')).toBe('/homebridge/api')
    })
  })

  describe('the page', () => {
    const page = '<html><head><title>Homebridge</title><base href="/" /><link rel="icon" href="assets/favicon.png" /></head></html>'

    it('tells the browser where the UI lives', () => {
      expect(setBaseHref(page, '/homebridge')).toContain('<base href="/homebridge/" />')
      expect(setBaseHref(page, '/homebridge')).not.toContain('<base href="/" />')
    })

    it('is not changed when there is no web root', () => {
      expect(setBaseHref(page, '')).toBe(page)
    })

    // A link that starts with a slash goes to the root of the server, past the web root
    it('has no link in its source that starts at the root of the server', async () => {
      const source = await readFile(resolve(__dirname, '../../ui/src/index.html'), 'utf-8')

      expect(source).toContain('<base href="/" />')
      expect(source.replace('<base href="/" />', '').match(/(?:href|src)="\/[^"]*"/g)).toBeNull()
    })

    it('has no such link in any template of the app either', async () => {
      const app = resolve(__dirname, '../../ui/src/app')
      const found: string[] = []
      for (const file of await readdir(app, { recursive: true })) {
        if (file.endsWith('.html')) {
          const links = (await readFile(resolve(app, file), 'utf-8')).match(/(?:href|src|action)="\/[^"]*"/g) ?? []
          found.push(...links.map(link => `${file}: ${link}`))
        }
      }

      expect(found).toEqual([])
    })

    it('has an installed app start under the web root, not at the root of the server', async () => {
      const manifest = await readJson(resolve(__dirname, '../../ui/src/assets/manifest.webmanifest'))

      // Relative to the manifest, which is in /assets
      expect(manifest.start_url).toBe('..')
      expect(manifest.icons.filter(icon => icon.src.startsWith('/'))).toEqual([])
    })

    it('is served with the web root, for a page address the server does not know', async () => {
      const base = await mkdtemp(join(tmpdir(), 'web-root-'))
      const before = process.env.UIX_BASE_PATH
      process.env.UIX_BASE_PATH = base
      try {
        await mkdir(join(base, 'public'))
        await writeFile(join(base, 'public', 'index.html'), page)
        const res = {
          code: vi.fn(() => res),
          send: vi.fn(),
          type: vi.fn(),
          header: vi.fn(),
        }
        const host: any = {
          switchToHttp: () => ({
            getRequest: () => ({ url: '/plugins' }),
            getResponse: () => res,
          }),
        }

        new SpaFilter('/homebridge').catch(new NotFoundException(), host)

        expect(res.send).toHaveBeenCalledWith(expect.stringContaining('<base href="/homebridge/" />'))
      } finally {
        process.env.UIX_BASE_PATH = before
        await rm(base, { recursive: true, force: true })
      }
    })
  })

  describe('the start-up config', () => {
    let dir: string
    const before = process.env.UIX_CONFIG_PATH
    const development = process.env.UIX_DEVELOPMENT

    async function startupWith(ui: Record<string, unknown>) {
      await writeFile(process.env.UIX_CONFIG_PATH, JSON.stringify({
        bridge: {},
        platforms: [
          { platform: 'config', ...ui },
        ],
      }))
      return getStartupConfig()
    }

    beforeEach(async () => {
      dir = await mkdtemp(join(tmpdir(), 'uix-web-root-'))
      process.env.UIX_CONFIG_PATH = join(dir, 'config.json')
      delete process.env.UIX_DEVELOPMENT
    })

    afterEach(async () => {
      process.env.UIX_CONFIG_PATH = before
      if (development === undefined) {
        delete process.env.UIX_DEVELOPMENT
      } else {
        process.env.UIX_DEVELOPMENT = development
      }
      await rm(dir, { recursive: true, force: true })
    })

    it('has the web root from config.json', async () => {
      expect((await startupWith({ webRoot: 'homebridge/' })).webRoot).toBe('/homebridge')
    })

    it('has no web root by default', async () => {
      expect((await startupWith({})).webRoot).toBe('')
    })

    it('starts at the root, instead of not at all, when the web root is not valid', async () => {
      expect((await startupWith({ webRoot: '/api' })).webRoot).toBe('')
    })

    it('has no web root in development, where the dev server calls the root address', async () => {
      process.env.UIX_DEVELOPMENT = '1'

      expect((await startupWith({ webRoot: '/homebridge' })).webRoot).toBe('')
    })
  })

  describe('a running server', () => {
    let app: NestFastifyApplication
    let origin: string
    let configService: ConfigService

    beforeAll(async () => {
      process.env.UIX_BASE_PATH = resolve(__dirname, '../../')
      process.env.UIX_STORAGE_PATH = resolve(__dirname, '../', '.homebridge')
      process.env.UIX_CONFIG_PATH = resolve(process.env.UIX_STORAGE_PATH, 'config.json')

      await copy(resolve(__dirname, '../mocks', 'config.json'), process.env.UIX_CONFIG_PATH)
      await copy(resolve(__dirname, '../mocks', 'auth.json'), resolve(process.env.UIX_STORAGE_PATH, 'auth.json'))
      await copy(resolve(__dirname, '../mocks', '.uix-secrets'), resolve(process.env.UIX_STORAGE_PATH, '.uix-secrets'))

      // A plugin with a settings page of its own
      process.env.UIX_CUSTOM_PLUGIN_PATH = resolve(process.env.UIX_STORAGE_PATH, 'plugins/node_modules')
      await remove(process.env.UIX_CUSTOM_PLUGIN_PATH)
      await copy(resolve(__dirname, '../mocks', 'plugins'), process.env.UIX_CUSTOM_PLUGIN_PATH)
      await ensureDir(resolve(process.env.UIX_CUSTOM_PLUGIN_PATH, 'homebridge-mock-plugin/homebridge-ui/public'))
      await writeFile(resolve(process.env.UIX_CUSTOM_PLUGIN_PATH, 'homebridge-mock-plugin/homebridge-ui/public/index.html'), '<h1>Hello World</h1>')

      const config = await readJson(process.env.UIX_CONFIG_PATH)
      config.platforms[0].webRoot = '/homebridge'
      await writeJson(process.env.UIX_CONFIG_PATH, config)

      const moduleFixture: TestingModule = await Test.createTestingModule({
        imports: [AppModule],
      }).compile()

      app = moduleFixture.createNestApplication<NestFastifyApplication>(new FastifyAdapter())
      app.setGlobalPrefix('/api')
      await app.init()
      await app.getHttpAdapter().getInstance().ready()

      configService = app.get(ConfigService)
      serveUnderWebRoot(app.getHttpServer(), configService.webRoot)

      await app.listen(0, '127.0.0.1')
      origin = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}`
    })

    afterAll(async () => {
      await app.close()
      await copy(resolve(__dirname, '../mocks', 'config.json'), process.env.UIX_CONFIG_PATH)
    })

    async function login(path: string) {
      return fetch(`${origin}${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username: 'admin', password: 'admin' }),
      })
    }

    it('answers the api under the web root', async () => {
      const res = await fetch(`${origin}/homebridge/api/auth/settings`)

      expect(res.status).toBe(200)
      expect((await res.json()).env.packageName).toBe('homebridge-config-ui-x')
    })

    it('still answers the api at the root, which health checks and hb-service status call', async () => {
      const res = await fetch(`${origin}/api/auth/settings`)

      expect(res.status).toBe(200)
    })

    it('does not answer under another path', async () => {
      const res = await fetch(`${origin}/other/api/auth/settings`)

      expect(res.status).toBe(404)
    })

    it('opens the live connection (socket.io) under the web root', async () => {
      const res = await fetch(`${origin}/homebridge/socket.io/?EIO=4&transport=polling`)

      expect(res.status).toBe(200)
      expect(await res.text()).toMatch(/^0\{"sid":/)
    })

    it('still opens the live connection at the root, for a proxy that takes the path off', async () => {
      const res = await fetch(`${origin}/socket.io/?EIO=4&transport=polling`)

      expect(res.status).toBe(200)
    })

    it('opens a websocket under the web root', async () => {
      const first = await new Promise<string>((done, failed) => {
        const socket = new WebSocket(`${origin.replace('http', 'ws')}/homebridge/socket.io/?EIO=4&transport=websocket`)
        socket.onmessage = (message) => {
          socket.close()
          done(String(message.data))
        }
        socket.onerror = () => failed(new Error('the websocket did not open'))
      })

      expect(first).toMatch(/^0\{"sid":/)
    })

    it('sets the session cookie for the path the browser calls', async () => {
      const res = await login('/homebridge/api/auth/login')

      expect(res.status).toBe(201)
      expect(res.headers.getSetCookie().find(cookie => cookie.startsWith('hb-refresh='))).toContain('Path=/homebridge/api/auth/session;')
    })

    it('clears the session cookie on the same path at sign out', async () => {
      const { access_token } = await (await login('/homebridge/api/auth/login')).json()

      const res = await fetch(`${origin}/homebridge/api/auth/logout`, {
        method: 'POST',
        headers: { authorization: `Bearer ${access_token}` },
      })

      expect(res.headers.getSetCookie().find(cookie => cookie.startsWith('hb-refresh=;'))).toContain('Path=/homebridge/api/auth/session;')
    })

    it('tells the settings page the web root that is saved', async () => {
      const { access_token } = await (await login('/homebridge/api/auth/login')).json()

      const res = await fetch(`${origin}/homebridge/api/auth/settings`, {
        headers: { authorization: `Bearer ${access_token}` },
      })

      expect((await res.json()).webRoot).toBe('/homebridge')
    })

    it('loads a plugin settings page under the web root, with its script and its cookie on that path', async () => {
      const { access_token } = await (await login('/homebridge/api/auth/login')).json()
      const pluginUi = `${origin}/homebridge/api/plugins/settings-ui/homebridge-mock-plugin`
      const issued = await fetch(`${pluginUi}/ticket`, {
        method: 'POST',
        headers: { authorization: `Bearer ${access_token}` },
      })

      const res = await fetch(`${pluginUi}/index.html?ticket=${(await issued.json()).ticket}`)

      expect(res.status).toBe(200)
      expect(await res.text()).toContain('<script src="/homebridge/assets/plugin-ui-utils/ui.js')
      expect(res.headers.getSetCookie()[0]).toContain('Path=/homebridge/api/plugins/settings-ui/homebridge-mock-plugin/;')
    })

    it('keeps the web root it started with until a restart, so a saved change cannot break the open page', () => {
      const config = structuredClone(configService.homebridgeConfig)
      config.platforms.find(x => x.platform === 'config').webRoot = '/elsewhere'

      configService.parseConfig(config)

      expect(configService.ui.webRoot).toBe('/elsewhere')
      expect(configService.webRoot).toBe('/homebridge')
    })
  })
})

import type { NestFastifyApplication } from '@nestjs/platform-fastify'
import type { TestingModule } from '@nestjs/testing'

import { resolve } from 'node:path'
import process from 'node:process'

import { HttpService } from '@nestjs/axios'
import { ValidationPipe } from '@nestjs/common'
import { FastifyAdapter } from '@nestjs/platform-fastify'
import { Test } from '@nestjs/testing'
import { AxiosResponse, InternalAxiosRequestConfig } from 'axios'
import { copy, ensureDir, remove, writeFile } from 'fs-extra'
import { of } from 'rxjs'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { AuthModule } from '../../src/core/auth/auth.module.js'
import { PluginsSettingsUiModule } from '../../src/modules/custom-plugins/plugins-settings-ui/plugins-settings-ui.module.js'
import { PluginsSettingsUiService } from '../../src/modules/custom-plugins/plugins-settings-ui/plugins-settings-ui.service.js'

import '../../src/global-defaults.js'

describe('PluginsSettingsUiController (e2e)', () => {
  let app: NestFastifyApplication
  let httpService: HttpService
  let sessionCookie: string

  let authFilePath: string
  let secretsFilePath: string
  let pluginsPath: string

  beforeAll(async () => {
    process.env.UIX_BASE_PATH = resolve(__dirname, '../../')
    process.env.UIX_STORAGE_PATH = resolve(__dirname, '../', '.homebridge')
    process.env.UIX_CONFIG_PATH = resolve(process.env.UIX_STORAGE_PATH, 'config.json')
    process.env.UIX_CUSTOM_PLUGIN_PATH = resolve(process.env.UIX_STORAGE_PATH, 'plugins/node_modules')

    authFilePath = resolve(process.env.UIX_STORAGE_PATH, 'auth.json')
    secretsFilePath = resolve(process.env.UIX_STORAGE_PATH, '.uix-secrets')
    pluginsPath = process.env.UIX_CUSTOM_PLUGIN_PATH

    // Setup test config
    await copy(resolve(__dirname, '../mocks', 'config.json'), process.env.UIX_CONFIG_PATH)

    // Setup test auth file
    await copy(resolve(__dirname, '../mocks', 'auth.json'), authFilePath)
    await copy(resolve(__dirname, '../mocks', '.uix-secrets'), secretsFilePath)

    await remove(pluginsPath)
    await copy(resolve(__dirname, '../mocks', 'plugins'), pluginsPath)

    // create httpService instance
    httpService = new HttpService()

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [PluginsSettingsUiModule, AuthModule],
    }).overrideProvider(HttpService).useValue(httpService).compile()

    app = moduleFixture.createNestApplication<NestFastifyApplication>(new FastifyAdapter())

    app.useGlobalPipes(new ValidationPipe({
      whitelist: true,
      skipMissingProperties: true,
    }))

    await app.init()
    await app.getHttpAdapter().getInstance().ready()

    await ensureDir(resolve(pluginsPath, 'homebridge-mock-plugin/homebridge-ui/public'))
    await writeFile(resolve(pluginsPath, 'homebridge-mock-plugin/homebridge-ui/public/index.html'), '<h1>Hello World</h1>')

    // Obtain a session cookie via login so authenticated tests can send it
    const loginRes = await app.inject({
      method: 'POST',
      path: '/auth/login',
      payload: { username: 'admin', password: 'admin' },
    })
    const { access_token } = JSON.parse(loginRes.body)
    sessionCookie = `hb-session=${access_token}`
  })

  beforeEach(async () => {
    vi.resetAllMocks()
  })

  it('GET /plugins/settings-ui/:plugin-name/ (no cookie → 401)', async () => {
    const res = await app.inject({
      method: 'GET',
      path: '/plugins/settings-ui/homebridge-mock-plugin/',
    })

    expect(res.statusCode).toBe(401)
  })

  it('GET /plugins/settings-ui/:plugin-name/ (invalid cookie → 401)', async () => {
    const res = await app.inject({
      method: 'GET',
      path: '/plugins/settings-ui/homebridge-mock-plugin/',
      headers: { cookie: 'hb-session=not-a-valid-jwt' },
    })

    expect(res.statusCode).toBe(401)
  })

  it('GET /plugins/settings-ui/:plugin-name/', async () => {
    const res = await app.inject({
      method: 'GET',
      path: '/plugins/settings-ui/homebridge-mock-plugin/',
      headers: { cookie: sessionCookie },
    })

    expect(res.statusCode).toBe(200)
    expect(res.body).toContain('Hello World')
    expect(res.body).toContain('homebridge-mock-plugin')
  })

  it('GET /plugins/settings-ui/:plugin-name/index.html', async () => {
    const res = await app.inject({
      method: 'GET',
      path: '/plugins/settings-ui/homebridge-mock-plugin/index.html',
      headers: { cookie: sessionCookie },
    })

    expect(res.statusCode).toBe(200)
    expect(res.body).toContain('Hello World')
    expect(res.body).toContain('homebridge-mock-plugin')
    // A non-empty CSP must be present on the index.html response
    const csp = res.headers['content-security-policy'] as string
    expect(csp).toBeTruthy()
    expect(csp).toContain('script-src')
    // Custom UIs ran without any CSP before v5.24.1 — frameworks that
    // evaluate expressions at runtime (e.g. Alpine.js, Vue) need this (#2873)
    expect(csp).toContain('\'unsafe-eval\'')
    expect(csp).toContain('frame-ancestors')
  })

  it('GET /plugins/settings-ui/:plugin-name/index.html (set origin)', async () => {
    const res = await app.inject({
      method: 'GET',
      path: `/plugins/settings-ui/homebridge-mock-plugin/index.html?origin=${encodeURIComponent('http://example.com')}`,
      headers: { cookie: sessionCookie },
    })

    expect(res.statusCode).toBe(200)
    expect(res.body).toContain('http://example.com/assets/plugin-ui-utils/ui.js')
  })

  it('GET /plugins/settings-ui/:plugin-name/index.html (XSS via origin → rejected)', async () => {
    const xssOrigin = encodeURIComponent('"></' + 'script><script>alert(document.domain)</script>')
    const res = await app.inject({
      method: 'GET',
      path: `/plugins/settings-ui/homebridge-mock-plugin/index.html?origin=${xssOrigin}`,
      headers: { cookie: sessionCookie },
    })

    expect(res.statusCode).toBe(200)
    // The malicious origin must not appear verbatim in the response
    expect(res.body).not.toContain('alert(document.domain)')
    // The fallback origin should be used instead
    expect(res.body).toContain('http://localhost:4200/assets/plugin-ui-utils/ui.js')
  })

  it('GET /plugins/settings-ui/:plugin-name/index.html (non-http origin → rejected)', async () => {
    const res = await app.inject({
      method: 'GET',
      path: `/plugins/settings-ui/homebridge-mock-plugin/index.html?origin=${encodeURIComponent('javascript:alert(1)')}`,
      headers: { cookie: sessionCookie },
    })

    expect(res.statusCode).toBe(200)
    expect(res.body).not.toContain('javascript:alert(1)')
    expect(res.body).toContain('http://localhost:4200/assets/plugin-ui-utils/ui.js')
  })

  it('GET /plugins/settings-ui/:plugin-name/index.html (no custom ui for plugin)', async () => {
    const res = await app.inject({
      method: 'GET',
      path: '/plugins/settings-ui/homebridge-mock-plugin-two/index.html',
      headers: { cookie: sessionCookie },
    })

    expect(res.statusCode).toBe(404)
  })

  it('GET /plugins/settings-ui/:plugin-name/../../../etc/passwd (path traversal blocked)', async () => {
    const res = await app.inject({
      method: 'GET',
      path: '/plugins/settings-ui/homebridge-mock-plugin/../../../etc/passwd',
      headers: { cookie: sessionCookie },
    })

    // Should not return 200 with file contents
    expect(res.statusCode).not.toBe(200)
  })

  it('GET /plugins/settings-ui/:plugin-name/ (nonexistent plugin)', async () => {
    const res = await app.inject({
      method: 'GET',
      path: '/plugins/settings-ui/homebridge-nonexistent-plugin/',
      headers: { cookie: sessionCookie },
    })

    expect(res.statusCode).toBe(404)
  })

  it('GET /plugins/settings-ui/:plugin-name/nonexistent.html (missing file)', async () => {
    const res = await app.inject({
      method: 'GET',
      path: '/plugins/settings-ui/homebridge-mock-plugin/nonexistent.html',
      headers: { cookie: sessionCookie },
    })

    expect(res.statusCode).toBe(404)
  })

  it('GET /plugins/settings-ui/:plugin-name/ with version query param', async () => {
    const res = await app.inject({
      method: 'GET',
      path: '/plugins/settings-ui/homebridge-mock-plugin/?v=1.0.0',
      headers: { cookie: sessionCookie },
    })

    expect(res.statusCode).toBe(200)
    expect(res.body).toContain('Hello World')
  })

  describe('PluginsSettingsUiService', () => {
    let pluginsSettingsUiService: PluginsSettingsUiService

    beforeEach(() => {
      pluginsSettingsUiService = app.get(PluginsSettingsUiService)
    })

    it('buildIndexHtml should escape script-breaking characters in plugin metadata', async () => {
      const maliciousPluginUi = {
        plugin: { name: '</script><script>alert(1)</script>' },
        publicPath: resolve(pluginsPath, 'homebridge-mock-plugin/homebridge-ui/public'),
        serverPath: resolve(pluginsPath, 'homebridge-mock-plugin/homebridge-ui/server'),
      }

      const html = await pluginsSettingsUiService.buildIndexHtml(maliciousPluginUi as any, 'http://localhost:4200')

      // The </script> should be escaped so it can't break out of the script tag
      expect(html).not.toContain('</script><script>alert(1)</script>')
      // The title should use HTML entities
      expect(html).toContain('&lt;')
    })

    it('buildIndexHtml should reject a malicious origin and use the fallback', async () => {
      const pluginUi = {
        plugin: { name: 'homebridge-mock-plugin' },
        publicPath: resolve(pluginsPath, 'homebridge-mock-plugin/homebridge-ui/public'),
        serverPath: resolve(pluginsPath, 'homebridge-mock-plugin/homebridge-ui/server'),
      }

      const xssOrigin = '"></' + 'script><script>alert(document.domain)</script>'
      const html = await pluginsSettingsUiService.buildIndexHtml(pluginUi as any, xssOrigin)

      expect(html).not.toContain('alert(document.domain)')
      expect(html).toContain('http://localhost:4200/assets/plugin-ui-utils/ui.js')
    })

    it('buildIndexHtml should reject a javascript: origin and use the fallback', async () => {
      const pluginUi = {
        plugin: { name: 'homebridge-mock-plugin' },
        publicPath: resolve(pluginsPath, 'homebridge-mock-plugin/homebridge-ui/public'),
        serverPath: resolve(pluginsPath, 'homebridge-mock-plugin/homebridge-ui/server'),
      }

      const html = await pluginsSettingsUiService.buildIndexHtml(pluginUi as any, 'javascript:alert(1)')

      expect(html).not.toContain('javascript:alert(1)')
      expect(html).toContain('http://localhost:4200/assets/plugin-ui-utils/ui.js')
    })

    it('startCustomUiHandler should emit ready with server:false when no server script', async () => {
      const { EventEmitter } = await import('node:events')
      const client = new EventEmitter()
      const emitSpy = vi.spyOn(client, 'emit')

      await pluginsSettingsUiService.startCustomUiHandler('homebridge-mock-plugin', client)

      expect(emitSpy).toHaveBeenCalledWith('ready', { server: false })
    })

    it('getPluginUiMetadata should return metadata for valid plugin', async () => {
      const metadata = await (pluginsSettingsUiService as any).getPluginUiMetadata('homebridge-mock-plugin')

      expect(metadata).toHaveProperty('plugin')
      expect(metadata).toHaveProperty('publicPath')
      expect(metadata).toHaveProperty('serverPath')
      expect(metadata.plugin.name).toBe('homebridge-mock-plugin')
    })

    it('getPluginUiMetadata should throw for nonexistent plugin', async () => {
      await expect((pluginsSettingsUiService as any).getPluginUiMetadata('homebridge-nonexistent'))
        .rejects
        .toThrow()
    })

    it('serveAssetsFromDevServer should proxy content from dev server', async () => {
      const response: AxiosResponse<any> = {
        data: '<div>Dev content</div>',
        headers: { 'content-type': 'text/html' },
        config: { url: 'http://localhost:4200' } as InternalAxiosRequestConfig,
        status: 200,
        statusText: 'OK',
      }

      vi.spyOn(httpService, 'get').mockReturnValue(of(response) as any)

      const mockReply = {
        header: vi.fn(),
        send: vi.fn(),
        code: vi.fn().mockReturnThis(),
      }

      const pluginUi = {
        devServer: 'http://localhost:4200',
        plugin: { name: 'homebridge-mock-plugin' },
        publicPath: '/fake/path',
        serverPath: '/fake/path',
      }

      await pluginsSettingsUiService.serveAssetsFromDevServer(mockReply, pluginUi as any, 'index.html')

      expect(mockReply.send).toHaveBeenCalledWith('<div>Dev content</div>')
    })

    it('serveAssetsFromDevServer should return 404 when dev server fails', async () => {
      vi.spyOn(httpService, 'get').mockImplementation(() => {
        throw new Error('Connection refused')
      })

      const mockReply = {
        header: vi.fn(),
        send: vi.fn(),
        code: vi.fn().mockReturnThis(),
      }

      const pluginUi = {
        devServer: 'http://localhost:9999',
        plugin: { name: 'homebridge-mock-plugin' },
        publicPath: '/fake/path',
        serverPath: '/fake/path',
      }

      await pluginsSettingsUiService.serveAssetsFromDevServer(mockReply, pluginUi as any, 'index.html')

      expect(mockReply.code).toHaveBeenCalledWith(404)
      expect(mockReply.send).toHaveBeenCalledWith('Not Found')
    })
  })

  describe('Gateway guard sentinel', () => {
    it('plugins-settings-ui gateway has WsAdminGuard applied', async () => {
      // Sentinel: if someone weakens the guard (dropping it, or swapping
      // for WsGuard) the test will fail and force a deliberate decision
      // rather than a silent regression. The custom-UI handler can spawn
      // a child process and forwards postMessage payloads — non-admins
      // must not reach it.
      const { PluginsSettingsUiGateway } = await import('../../src/modules/custom-plugins/plugins-settings-ui/plugins-settings-ui.gateway.js')
      const { WsAdminGuard } = await import('../../src/core/auth/guards/ws-admin-guard.js')
      const { Reflector } = await import('@nestjs/core')
      const reflector = new Reflector()
      const guards = reflector.get<any[]>('__guards__', PluginsSettingsUiGateway)
      expect(guards, 'no guards applied to PluginsSettingsUiGateway').toBeDefined()
      expect(guards.includes(WsAdminGuard)).toBe(true)
    })

    it('PluginsSettingsUiController has CookieAuthGuard applied', async () => {
      // Sentinel: ensures the HTTP asset-serving routes remain protected by
      // the cookie guard. If the guard is removed the test fails, making any
      // regression a deliberate, reviewed decision.
      const { PluginsSettingsUiController } = await import('../../src/modules/custom-plugins/plugins-settings-ui/plugins-settings-ui.controller.js')
      const { CookieAuthGuard } = await import('../../src/core/auth/guards/cookie-auth.guard.js')
      const { Reflector } = await import('@nestjs/core')
      const reflector = new Reflector()
      const guards = reflector.get<any[]>('__guards__', PluginsSettingsUiController)
      expect(guards, 'no guards applied to PluginsSettingsUiController').toBeDefined()
      expect(guards.includes(CookieAuthGuard)).toBe(true)
    })
  })

  afterAll(async () => {
    await app.close()
  })
})

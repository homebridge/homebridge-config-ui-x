import type { NestFastifyApplication } from '@nestjs/platform-fastify'
import type { TestingModule } from '@nestjs/testing'
import type { MockInstance } from 'vitest'

import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import process from 'node:process'

import fastifyStatic from '@fastify/static'
import { HttpService } from '@nestjs/axios'
import { ValidationPipe } from '@nestjs/common'
import { FastifyAdapter } from '@nestjs/platform-fastify'
import { Test } from '@nestjs/testing'
import { AxiosResponse, InternalAxiosRequestConfig } from 'axios'
import { copy, ensureDir, remove, writeFile } from 'fs-extra'
import { of } from 'rxjs'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { API_PREFIX } from '../../src/core/api.constants.js'
import { AuthModule } from '../../src/core/auth/auth.module.js'
import { PluginsSettingsUiModule } from '../../src/modules/custom-plugins/plugins-settings-ui/plugins-settings-ui.module.js'
import { PluginsSettingsUiService } from '../../src/modules/custom-plugins/plugins-settings-ui/plugins-settings-ui.service.js'
import { PluginsService } from '../../src/modules/plugins/plugins.service.js'

import '../../src/global-defaults.js'

describe('PluginsSettingsUiController (e2e)', () => {
  let app: NestFastifyApplication
  let httpService: HttpService
  let accessToken: string

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

    const adapter = new FastifyAdapter()
    adapter.register(fastifyStatic, { root: process.env.UIX_BASE_PATH })
    app = moduleFixture.createNestApplication<NestFastifyApplication>(adapter)
    app.setGlobalPrefix(API_PREFIX)

    app.useGlobalPipes(new ValidationPipe({
      whitelist: true,
      skipMissingProperties: true,
    }))

    await app.init()
    await app.getHttpAdapter().getInstance().ready()

    await ensureDir(resolve(pluginsPath, 'homebridge-mock-plugin/homebridge-ui/public'))
    await writeFile(resolve(pluginsPath, 'homebridge-mock-plugin/homebridge-ui/public/index.html'), '<h1>Hello World</h1>')
    await writeFile(resolve(pluginsPath, 'homebridge-mock-plugin/homebridge-ui/public/main.js'), 'window.customUiLoaded = true')
    await ensureDir(resolve(pluginsPath, 'homebridge-mock-plugin/homebridge-ui/public/assets'))
    await writeFile(resolve(pluginsPath, 'homebridge-mock-plugin/homebridge-ui/public/assets/logo.svg'), '<svg xmlns="http://www.w3.org/2000/svg"></svg>')
    await writeFile(resolve(pluginsPath, 'homebridge-mock-plugin/homebridge-ui/public/other.html'), '<h1>Not an entrypoint</h1>')

    // Obtain the primary bearer used to issue narrow, single-use UI tickets.
    const loginRes = await app.inject({
      method: 'POST',
      path: `${API_PREFIX}/auth/login`,
      payload: { username: 'admin', password: 'admin' },
    })
    accessToken = JSON.parse(loginRes.body).access_token
  })

  async function issueTicket(pluginName = 'homebridge-mock-plugin', origin?: string) {
    return await app.inject({
      method: 'POST',
      path: `${API_PREFIX}/plugins/settings-ui/${pluginName}/ticket`,
      headers: {
        authorization: `Bearer ${accessToken}`,
        host: 'localhost:8581',
        ...(origin ? { origin } : {}),
      },
    })
  }

  async function loadIndex(origin?: string, pluginName = 'homebridge-mock-plugin', version?: string) {
    const issued = await issueTicket(pluginName, origin)
    if (issued.statusCode !== 201) {
      return issued
    }
    return await app.inject({
      method: 'GET',
      path: `${API_PREFIX}/plugins/settings-ui/${pluginName}/index.html?${new URLSearchParams({ ticket: issued.json().ticket, ...(version ? { v: version } : {}) })}`,
    })
  }

  function assetCookie(indexResponse): string {
    const setCookie = indexResponse.headers['set-cookie']
    const header = Array.isArray(setCookie) ? setCookie[0] : setCookie
    return header.split(';')[0]
  }

  beforeEach(async () => {
    vi.resetAllMocks()
  })

  describe('/plugins/settings-ui/:plugin-name', () => {
    describe('authentication', () => {
      it('rejects direct navigation to the generated index without a ticket', async () => {
        const res = await app.inject({
          method: 'GET',
          path: `${API_PREFIX}/plugins/settings-ui/homebridge-mock-plugin/index.html`,
        })

        expect(res.statusCode).toBe(401)
      })

      it('rejects a crafted URL even when it carries a legacy session cookie', async () => {
        const res = await app.inject({
          method: 'GET',
          path: `${API_PREFIX}/plugins/settings-ui/homebridge-mock-plugin/index.html?origin=https%3A%2F%2Fattacker.example`,
          headers: { cookie: `hb-session=${accessToken}` },
        })
        expect(res.statusCode).toBe(401)
      })

      it('rejects ticket issuance without a bearer token', async () => {
        const res = await app.inject({
          method: 'POST',
          path: `${API_PREFIX}/plugins/settings-ui/homebridge-mock-plugin/ticket`,
        })
        expect(res.statusCode).toBe(401)
      })

      it('rejects an invalid bearer token when issuing a ticket', async () => {
        const res = await app.inject({
          method: 'POST',
          path: `${API_PREFIX}/plugins/settings-ui/homebridge-mock-plugin/ticket`,
          headers: { authorization: 'Bearer not-a-valid-jwt' },
        })

        expect(res.statusCode).toBe(401)
      })

      it('issues and redeems a bearer-authorized ticket', async () => {
        const res = await loadIndex()

        expect(res.statusCode).toBe(200)
        expect(res.body).toContain('Hello World')
        expect(res.body).toContain('homebridge-mock-plugin')
        expect(res.headers['set-cookie']).toContain('hb-plugin-ui=')
        expect(res.headers['set-cookie']).toContain('HttpOnly')
        expect(res.headers['set-cookie']).toContain('SameSite=Strict')
        expect(res.headers['set-cookie']).toContain('Path=/api/plugins/settings-ui/homebridge-mock-plugin/')
        expect(res.headers['set-cookie']).toContain('Max-Age=1800')
      })

      it('rejects replay of a consumed ticket', async () => {
        const issued = await issueTicket()
        const path = `${API_PREFIX}/plugins/settings-ui/homebridge-mock-plugin/index.html?ticket=${encodeURIComponent(issued.json().ticket)}`
        const first = await app.inject({ method: 'GET', path })
        const replay = await app.inject({ method: 'GET', path })

        expect(first.statusCode).toBe(200)
        expect(replay.statusCode).toBe(401)
      })

      it('reloads the primary index with its existing asset session', async () => {
        const issued = await issueTicket()
        const path = `${API_PREFIX}/plugins/settings-ui/homebridge-mock-plugin/index.html?ticket=${encodeURIComponent(issued.json().ticket)}`
        const first = await app.inject({ method: 'GET', path })
        const reloaded = await app.inject({
          method: 'GET',
          path,
          headers: { cookie: assetCookie(first) },
        })

        expect(first.statusCode).toBe(200)
        expect(reloaded.statusCode).toBe(200)
        expect(reloaded.body).toContain('Hello World')
        expect(reloaded.headers['set-cookie']).toContain('Max-Age=1800')
      })

      it('rejects a ticket against a different plugin', async () => {
        const issued = await issueTicket()
        const res = await app.inject({
          method: 'GET',
          path: `${API_PREFIX}/plugins/settings-ui/homebridge-mock-plugin-two/index.html?ticket=${encodeURIComponent(issued.json().ticket)}`,
        })
        expect(res.statusCode).toBe(401)
      })

      it('rejects an oversized ticket before hashing it', async () => {
        const res = await app.inject({
          method: 'GET',
          path: `${API_PREFIX}/plugins/settings-ui/homebridge-mock-plugin/index.html?ticket=${'a'.repeat(129)}`,
        })
        expect(res.statusCode).toBe(401)
      })

      it('rejects repeated ticket query parameters without a server error', async () => {
        const res = await app.inject({
          method: 'GET',
          path: `${API_PREFIX}/plugins/settings-ui/homebridge-mock-plugin/index.html?ticket=one&ticket=two`,
        })

        expect(res.statusCode).toBe(401)
      })
    })

    describe('index HTML and CSP', () => {
      it('serves the plugin index with its content security policy', async () => {
        const res = await loadIndex()

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

      it('ignores customUiCspDomains entries longer than 256 bytes', async () => {
        const { readJson, writeJson } = await import('fs-extra')

        const baseSchemaPath = resolve(pluginsPath, 'homebridge-mock-plugin', 'config.schema.json')
        const baseSchema = await readJson(baseSchemaPath)
        const maxLengthDomain = `https://${'a'.repeat(244)}.com`
        const overLengthDomain = `https://${'b'.repeat(245)}.com`
        const pluginsService = app.get(PluginsService)
        const loggerErrorSpy = vi.spyOn((pluginsService as any).logger, 'error').mockImplementation(() => undefined)

        try {
          await writeJson(baseSchemaPath, {
            ...baseSchema,
            customUiCspDomains: [maxLengthDomain, overLengthDomain],
          })
          ;(app.get(PluginsSettingsUiService) as any).pluginUiMetadataCache.del('homebridge-mock-plugin')
          ;(app.get(PluginsSettingsUiService) as any).pluginUiLastVersionCache.del('homebridge-mock-plugin')

          const res = await loadIndex()

          expect(res.statusCode).toBe(200)
          const csp = res.headers['content-security-policy'] as string
          expect(csp).toContain(maxLengthDomain)
          expect(csp).not.toContain(overLengthDomain)
          expect(loggerErrorSpy).toHaveBeenCalledWith('Ignoring customUiCspDomains entry longer than 256 bytes.')
        } finally {
          await writeJson(baseSchemaPath, baseSchema)
          ;(app.get(PluginsSettingsUiService) as any).pluginUiMetadataCache.del('homebridge-mock-plugin')
          ;(app.get(PluginsSettingsUiService) as any).pluginUiLastVersionCache.del('homebridge-mock-plugin')
        }
      })
    })

    describe('origin handling', () => {
      let previousDevelopment: string | undefined

      beforeEach(() => {
        previousDevelopment = process.env.UIX_DEVELOPMENT
      })

      afterEach(() => {
        if (previousDevelopment === undefined) {
          delete process.env.UIX_DEVELOPMENT
        } else {
          process.env.UIX_DEVELOPMENT = previousDevelopment
        }
      })

      describe('in production', () => {
        beforeEach(() => {
          delete process.env.UIX_DEVELOPMENT
        })

        it.each([
          {
            description: 'a matching development-server origin',
            origin: 'http://localhost:4200',
          },
          {
            description: 'an attacker hostname on an allowed development port',
            origin: 'http://attacker.example.com:4200',
          },
          {
            description: 'a matching hostname on a non-development port',
            origin: 'http://localhost:4444',
          },
          {
            description: 'an origin containing an XSS payload',
            origin: '"></' + 'script><script>alert(document.domain)</script>',
          },
          {
            description: 'a non-http origin',
            origin: 'javascript:alert(1)',
          },
        ])('ignores $description', async ({ origin }) => {
          const res = await loadIndex(origin)

          expect(res.statusCode).toBe(200)
          expect(res.body).not.toContain(origin)
          expect(res.headers['content-security-policy']).not.toContain(origin)
          expect(res.body).toContain('src="/assets/plugin-ui-utils/ui.js')
        })
      })

      describe('in development', () => {
        beforeEach(() => {
          process.env.UIX_DEVELOPMENT = '1'
        })

        it('allows a matching development-server origin', async () => {
          // `npm run dev` serves the UI on 4200 while the API answers on 8581, so a
          // relative path would not find the asset. Same host, dev port, so allowed.
          const origin = 'http://localhost:4200'
          const res = await loadIndex(origin)

          expect(res.statusCode).toBe(200)
          expect(res.body).toContain(`${origin}/assets/plugin-ui-utils/ui.js`)
          expect(res.headers['content-security-policy']).toContain(origin)
          expect(res.headers['content-security-policy']).toContain(`font-src 'self' data: ${origin}`)
        })

        it('rejects an attacker hostname on an allowed development port', async () => {
          const origin = 'http://attacker.example.com:4200'
          const res = await loadIndex(origin)

          expect(res.statusCode).toBe(200)
          expect(res.body).not.toContain(origin)
          expect(res.headers['content-security-policy']).not.toContain(origin)
          expect(res.body).toContain('src="/assets/plugin-ui-utils/ui.js')
        })

        it('rejects a matching hostname on a non-development port', async () => {
          const origin = 'http://localhost:4444'
          const res = await loadIndex(origin)

          expect(res.statusCode).toBe(200)
          expect(res.body).not.toContain(origin)
          expect(res.headers['content-security-policy']).not.toContain(origin)
          expect(res.body).toContain('src="/assets/plugin-ui-utils/ui.js')
        })

        it('rejects an origin containing an XSS payload', async () => {
          const xssOrigin = '"></' + 'script><script>alert(document.domain)</script>'
          const res = await loadIndex(xssOrigin)

          expect(res.statusCode).toBe(200)
          expect(res.body).not.toContain('alert(document.domain)')
          expect(res.body).toContain('src="/assets/plugin-ui-utils/ui.js')
        })

        it('rejects a non-http origin', async () => {
          const origin = 'javascript:alert(1)'
          const res = await loadIndex(origin)

          expect(res.statusCode).toBe(200)
          expect(res.body).not.toContain(origin)
          expect(res.body).toContain('src="/assets/plugin-ui-utils/ui.js')
        })
      })
    })

    describe('asset handling', () => {
      it('returns 404 when the plugin has no custom UI', async () => {
        const res = await issueTicket('homebridge-mock-plugin-two')

        expect(res.statusCode).toBe(404)
      })

      it('rejects an asset request without a custom-UI session', async () => {
        const res = await app.inject({
          method: 'GET',
          path: `${API_PREFIX}/plugins/settings-ui/homebridge-mock-plugin/main.js`,
        })

        expect(res.statusCode).toBe(401)
      })

      it('serves existing JavaScript without changing its URL after ticket redemption', async () => {
        const index = await loadIndex()
        const res = await app.inject({
          method: 'GET',
          path: `${API_PREFIX}/plugins/settings-ui/homebridge-mock-plugin/main.js`,
          headers: { cookie: assetCookie(index) },
        })

        expect(res.statusCode).toBe(200)
        expect(res.body).toContain('customUiLoaded')
        expect(res.headers['x-content-type-options']).toBe('nosniff')
        expect(res.headers['set-cookie']).toContain('Max-Age=1800')
      })

      it('revokes the asset session and expires its cookie', async () => {
        const index = await loadIndex()
        const cookie = assetCookie(index)
        const revoked = await app.inject({
          method: 'POST',
          path: `${API_PREFIX}/plugins/settings-ui/homebridge-mock-plugin/session/revoke`,
          headers: {
            authorization: `Bearer ${accessToken}`,
            cookie,
          },
        })
        const denied = await app.inject({
          method: 'GET',
          path: `${API_PREFIX}/plugins/settings-ui/homebridge-mock-plugin/main.js`,
          headers: { cookie },
        })

        expect(revoked.statusCode).toBe(201)
        expect(revoked.headers['set-cookie']).toContain('hb-plugin-ui=;')
        expect(revoked.headers['set-cookie']).toContain('Max-Age=0')
        expect(denied.statusCode).toBe(401)
      })

      it('revokes the user asset session and expires its cookie on logout', async () => {
        const login = await app.inject({
          method: 'POST',
          path: `${API_PREFIX}/auth/login`,
          payload: { username: 'admin', password: 'admin' },
        })
        const userAccessToken = login.json().access_token
        const issued = await app.inject({
          method: 'POST',
          path: `${API_PREFIX}/plugins/settings-ui/homebridge-mock-plugin/ticket`,
          headers: { authorization: `Bearer ${userAccessToken}` },
        })
        const index = await app.inject({
          method: 'GET',
          path: `${API_PREFIX}/plugins/settings-ui/homebridge-mock-plugin/index.html?ticket=${encodeURIComponent(issued.json().ticket)}`,
        })
        expect(index.statusCode).toBe(200)
        const cookie = assetCookie(index)

        const loggedOut = await app.inject({
          method: 'POST',
          path: `${API_PREFIX}/auth/logout`,
          headers: { authorization: `Bearer ${userAccessToken}` },
        })
        const denied = await app.inject({
          method: 'GET',
          path: `${API_PREFIX}/plugins/settings-ui/homebridge-mock-plugin/main.js`,
          headers: { cookie },
        })

        const cleared = Array.isArray(loggedOut.headers['set-cookie'])
          ? loggedOut.headers['set-cookie']
          : [loggedOut.headers['set-cookie']]
        expect(cleared.some(value => value?.startsWith('hb-plugin-ui=;')
          && value.includes('Path=/api/plugins/settings-ui/homebridge-mock-plugin/')
          && value.includes('Max-Age=0'))).toBe(true)
        expect(denied.statusCode).toBe(401)
      })

      it('serves an existing SVG with a restrictive response CSP', async () => {
        const index = await loadIndex()
        const res = await app.inject({
          method: 'GET',
          path: `${API_PREFIX}/plugins/settings-ui/homebridge-mock-plugin/assets/logo.svg`,
          headers: { cookie: assetCookie(index) },
        })

        expect(res.statusCode).toBe(200)
        expect(res.headers['content-security-policy']).toContain('default-src \'none\'')
        expect(res.headers['x-content-type-options']).toBe('nosniff')
      })

      it('rejects alternative HTML documents even with a valid asset session', async () => {
        const index = await loadIndex()
        const res = await app.inject({
          method: 'GET',
          path: `${API_PREFIX}/plugins/settings-ui/homebridge-mock-plugin/other.html`,
          headers: { cookie: assetCookie(index) },
        })

        expect(res.statusCode).toBe(404)
      })

      it('does not authorize another plugin with an asset session', async () => {
        const index = await loadIndex()
        const res = await app.inject({
          method: 'GET',
          path: `${API_PREFIX}/plugins/settings-ui/homebridge-mock-plugin-two/main.js`,
          headers: { cookie: assetCookie(index) },
        })

        expect(res.statusCode).toBe(401)
      })

      it('returns 404 for a missing authenticated asset', async () => {
        const index = await loadIndex()
        const res = await app.inject({
          method: 'GET',
          path: `${API_PREFIX}/plugins/settings-ui/homebridge-mock-plugin/nonexistent.js`,
          headers: { cookie: assetCookie(index) },
        })

        expect(res.statusCode).toBe(404)
      })

      it('serves the plugin UI with a version query parameter', async () => {
        const res = await loadIndex(undefined, 'homebridge-mock-plugin', '1.0.0')

        expect(res.statusCode).toBe(200)
        expect(res.body).toContain('Hello World')
      })
    })

    describe('path and plugin validation', () => {
      it('blocks path traversal', async () => {
        const res = await app.inject({
          method: 'GET',
          path: `${API_PREFIX}/plugins/settings-ui/homebridge-mock-plugin/../../../etc/passwd`,
        })

        // Should not return 200 with file contents
        expect(res.statusCode).not.toBe(200)
      })

      it('returns 404 for a nonexistent plugin', async () => {
        const res = await issueTicket('homebridge-nonexistent-plugin')

        expect(res.statusCode).toBe(404)
      })
    })
  })

  describe('frontend iframe navigation sentinel', () => {
    it('navigates the iframe directly after ticket issuance instead of silently submitting a hidden form', async () => {
      // Regression sentinel for the blank custom-UI failure: a form targeted
      // at the sandboxed iframe could fail without surfacing an Angular or
      // server error. Keep redemption tied to an observable src navigation.
      const component = await readFile(resolve(
        __dirname,
        '../../ui/src/app/core/plugins/custom-plugins/custom-plugins.component.ts',
      ), 'utf8')

      expect(component).toMatch(/url\.searchParams\.set\('ticket', ticket\)/)
      expect(component).toContain('this.iframe.src = url.toString()')
      expect(component).not.toContain('form.submit()')
      expect(component).toContain('e.source === this.iframe?.contentWindow')
      expect(component).toContain('await this.revokeAssetSession()')
      expect(component).toMatch(/this\.basePath\}\/session\/revoke/)
      expect(component).toMatch(/ngOnDestroy\(\): void \{[\s\S]*void this\.revokeAssetSession\(\)/)
    })
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

    it('buildIndexHtml should reject a malicious origin and fall back to a relative path', async () => {
      const pluginUi = {
        plugin: { name: 'homebridge-mock-plugin' },
        publicPath: resolve(pluginsPath, 'homebridge-mock-plugin/homebridge-ui/public'),
        serverPath: resolve(pluginsPath, 'homebridge-mock-plugin/homebridge-ui/server'),
      }

      const xssOrigin = '"></' + 'script><script>alert(document.domain)</script>'
      const html = await pluginsSettingsUiService.buildIndexHtml(pluginUi as any, xssOrigin)

      expect(html).not.toContain('alert(document.domain)')
      expect(html).toContain('src="/assets/plugin-ui-utils/ui.js')
    })

    it('buildIndexHtml should reject a javascript: origin and fall back to a relative path', async () => {
      const pluginUi = {
        plugin: { name: 'homebridge-mock-plugin' },
        publicPath: resolve(pluginsPath, 'homebridge-mock-plugin/homebridge-ui/public'),
        serverPath: resolve(pluginsPath, 'homebridge-mock-plugin/homebridge-ui/server'),
      }

      const html = await pluginsSettingsUiService.buildIndexHtml(pluginUi as any, 'javascript:alert(1)')

      expect(html).not.toContain('javascript:alert(1)')
      expect(html).toContain('src="/assets/plugin-ui-utils/ui.js')
    })

    it('buildIndexHtml should reject an http origin outside the development ports', async () => {
      const pluginUi = {
        plugin: { name: 'homebridge-mock-plugin' },
        publicPath: resolve(pluginsPath, 'homebridge-mock-plugin/homebridge-ui/public'),
        serverPath: resolve(pluginsPath, 'homebridge-mock-plugin/homebridge-ui/server'),
      }

      const html = await pluginsSettingsUiService.buildIndexHtml(pluginUi as any, 'https://evil.example.com')

      expect(html).not.toContain('https://evil.example.com')
      expect(html).toContain('src="/assets/plugin-ui-utils/ui.js')
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
  })

  describe('startCustomUiHandler sessions', () => {
    // The message the service sends back for any request it cannot forward to a helper.
    const customUiUnavailable = 'The custom UI server for this plugin is not available.'

    // Every wait below spans a real child process booting, answering over IPC or exiting, so these
    // poll for the outcome instead of sleeping for a guessed interval.
    const waitOptions = { interval: 50, timeout: 5000 }

    let pluginsSettingsUiService: PluginsSettingsUiService

    beforeEach(() => {
      pluginsSettingsUiService = app.get(PluginsSettingsUiService)
    })

    // Each test drives its own socket, so no listener, child or spy state carries between them.
    async function createClient() {
      const { EventEmitter } = await import('node:events')
      const client = new EventEmitter()

      return { client, emitSpy: vi.spyOn(client, 'emit') }
    }

    // Wait for the socket to receive an event and hand back the payload it carried.
    async function waitForEmit(emitSpy: MockInstance, event: string, match: (payload: any) => boolean = () => true): Promise<any> {
      let payload: any

      await vi.waitFor(() => {
        const call = emitSpy.mock.calls.find(([name, value]) => name === event && match(value))
        if (!call) {
          throw new Error(`the socket has not received a matching '${event}' event`)
        }
        payload = call[1]
      }, waitOptions)

      return payload
    }

    function countEmits(emitSpy: MockInstance, event: string, match: (payload: any) => boolean = () => true): number {
      return emitSpy.mock.calls.filter(([name, value]) => name === event && match(value)).length
    }

    it('rejects a request when the plugin ships no server-side script', async () => {
      const { client, emitSpy } = await createClient()

      await pluginsSettingsUiService.startCustomUiHandler('homebridge-mock-plugin', client)
      client.emit('request', { requestId: 'r1', path: '/x' })

      expect(emitSpy).toHaveBeenCalledWith('response', {
        requestId: 'r1',
        success: false,
        data: { message: customUiUnavailable },
      })

      client.emit('end')
    })

    it('keeps sessions on separate sockets isolated from each other', async () => {
      const a = await createClient()
      const b = await createClient()

      await pluginsSettingsUiService.startCustomUiHandler('homebridge-mock-plugin', a.client)
      await pluginsSettingsUiService.startCustomUiHandler('homebridge-mock-plugin', b.client)

      a.client.emit('request', { requestId: 'r-a', path: '/x' })

      expect(a.emitSpy).toHaveBeenCalledWith('response', {
        requestId: 'r-a',
        success: false,
        data: { message: customUiUnavailable },
      })
      expect(countEmits(b.emitSpy, 'response')).toBe(0)

      a.client.emit('disconnect')

      expect(a.client.listenerCount('request')).toBe(0)
      expect(a.client.listenerCount('disconnect')).toBe(0)
      expect(a.client.listenerCount('end')).toBe(0)
      expect(b.client.listenerCount('request')).toBe(1)
      expect(b.client.listenerCount('disconnect')).toBe(1)
      expect(b.client.listenerCount('end')).toBe(1)

      b.client.emit('end')
    })

    it('collapses overlapping starts on one socket into a single session', async () => {
      const { client, emitSpy } = await createClient()

      const first = pluginsSettingsUiService.startCustomUiHandler('homebridge-mock-plugin', client)
      const second = pluginsSettingsUiService.startCustomUiHandler('homebridge-mock-plugin', client)
      await Promise.all([first, second])

      expect(emitSpy).toHaveBeenCalledExactlyOnceWith('ready', { server: false })
      expect(client.listenerCount('request')).toBe(1)
      expect(client.listenerCount('disconnect')).toBe(1)
      expect(client.listenerCount('end')).toBe(1)

      client.emit('end')
    })

    describe('with a helper child running', () => {
      // A dependency-free stand-in for a plugin's server-side script, speaking the raw IPC protocol
      // and mirroring how @homebridge/plugin-ui-utils behaves: it announces itself once it boots and
      // terminates itself the moment the parent closes the IPC channel.
      const helperScript = `
process.send({ action: 'ready', payload: { server: true } })

process.on('disconnect', () => {
  process.kill(process.pid, 'SIGTERM')
})

process.on('message', (request) => {
  if (request.path === '/exit') {
    process.exit(0)
  }

  if (request.path === '/hang') {
    return
  }

  process.send({ action: 'response', payload: { requestId: request.requestId, success: true, data: { echo: request.path } } })
})
`

      let serverPath: string

      beforeAll(async () => {
        serverPath = resolve(pluginsPath, 'homebridge-mock-plugin/homebridge-ui/server.js')
        await writeFile(serverPath, helperScript)
      })

      afterAll(async () => {
        await remove(serverPath)
      })

      it('relays a request to the helper and returns its response', async () => {
        const { client, emitSpy } = await createClient()

        await pluginsSettingsUiService.startCustomUiHandler('homebridge-mock-plugin', client)

        expect(await waitForEmit(emitSpy, 'ready')).toEqual({ server: true })

        client.emit('request', { requestId: 'r2', path: '/hello' })

        expect(await waitForEmit(emitSpy, 'response', payload => payload?.requestId === 'r2'))
          .toEqual({ requestId: 'r2', success: true, data: { echo: '/hello' } })

        client.emit('end')
      })

      it('supersedes the previous helper when the same socket starts again', async () => {
        const { client, emitSpy } = await createClient()

        await pluginsSettingsUiService.startCustomUiHandler('homebridge-mock-plugin', client)
        await waitForEmit(emitSpy, 'ready')
        await pluginsSettingsUiService.startCustomUiHandler('homebridge-mock-plugin', client)

        expect(client.listenerCount('request')).toBe(1)

        client.emit('request', { requestId: 'r-second', path: '/again' })

        expect(await waitForEmit(emitSpy, 'response', payload => payload?.requestId === 'r-second'))
          .toEqual({ requestId: 'r-second', success: true, data: { echo: '/again' } })

        // A listener left behind by the superseded session would answer this same request id a
        // second time, with a rejection from its own dead child.
        expect(countEmits(emitSpy, 'response', payload => payload?.requestId === 'r-second')).toBe(1)

        client.emit('end')
      })

      it('rejects requests that arrive once the helper has died', async () => {
        const { client, emitSpy } = await createClient()

        await pluginsSettingsUiService.startCustomUiHandler('homebridge-mock-plugin', client)
        await waitForEmit(emitSpy, 'ready')

        client.emit('request', { requestId: 'r-exit', path: '/exit' })

        // The child's `connected` flag drops a moment after the child itself is gone, so a single
        // post-exit request can still be handed to it and vanish. Re-emitting under a fresh request
        // id each poll, and only accepting an answer to the id emitted in that same tick, pins the
        // rejection to the arrival path rather than to any later settlement.
        let attempt = 0
        let rejection: any

        await vi.waitFor(() => {
          const requestId = `r-dead-${attempt++}`
          client.emit('request', { requestId, path: '/x' })
          const call = emitSpy.mock.calls.find(([name, payload]) => name === 'response' && payload?.requestId === requestId)
          if (!call) {
            throw new Error('the socket has not received a rejection yet')
          }
          rejection = call[1]
        }, waitOptions)

        expect(rejection).toEqual({
          requestId: expect.stringMatching(/^r-dead-\d+$/),
          success: false,
          data: { message: customUiUnavailable },
        })

        client.emit('end')
      })

      it('tears the session down on disconnect and re-establishes it on a later start', async () => {
        const { client, emitSpy } = await createClient()

        await pluginsSettingsUiService.startCustomUiHandler('homebridge-mock-plugin', client)
        await waitForEmit(emitSpy, 'ready')

        client.emit('disconnect')

        expect(client.listenerCount('request')).toBe(0)
        expect(client.listenerCount('disconnect')).toBe(0)
        expect(client.listenerCount('end')).toBe(0)

        await pluginsSettingsUiService.startCustomUiHandler('homebridge-mock-plugin', client)

        expect(client.listenerCount('request')).toBe(1)
        expect(client.listenerCount('disconnect')).toBe(1)
        expect(client.listenerCount('end')).toBe(1)

        client.emit('request', { requestId: 'r-again', path: '/back' })

        expect(await waitForEmit(emitSpy, 'response', payload => payload?.requestId === 'r-again'))
          .toEqual({ requestId: 'r-again', success: true, data: { echo: '/back' } })

        client.emit('end')
      })

      it('forks a single helper when starts overlap', async () => {
        const { client, emitSpy } = await createClient()

        const first = pluginsSettingsUiService.startCustomUiHandler('homebridge-mock-plugin', client)
        const second = pluginsSettingsUiService.startCustomUiHandler('homebridge-mock-plugin', client)
        await Promise.all([first, second])
        await waitForEmit(emitSpy, 'ready')

        expect(client.listenerCount('request')).toBe(1)

        client.emit('request', { requestId: 'r-single', path: '/single' })

        expect(await waitForEmit(emitSpy, 'response', payload => payload?.requestId === 'r-single'))
          .toEqual({ requestId: 'r-single', success: true, data: { echo: '/single' } })

        // Both invocations have long since settled by now, so a second child would have announced
        // itself and answered alongside the first.
        expect(countEmits(emitSpy, 'ready')).toBe(1)
        expect(countEmits(emitSpy, 'response', payload => payload?.requestId === 'r-single')).toBe(1)

        client.emit('end')
      })

      it('settles in-flight requests when the helper dies', async () => {
        const { client, emitSpy } = await createClient()

        await pluginsSettingsUiService.startCustomUiHandler('homebridge-mock-plugin', client)
        await waitForEmit(emitSpy, 'ready')

        client.emit('request', { requestId: 'r-hang', path: '/hang' })
        client.emit('request', { requestId: 'r-exit2', path: '/exit' })

        expect(await waitForEmit(emitSpy, 'response', payload => payload?.requestId === 'r-hang'))
          .toEqual({ requestId: 'r-hang', success: false, data: { message: customUiUnavailable } })

        client.emit('end')
      })
    })
  })

  afterAll(async () => {
    await app.close()
  })
})

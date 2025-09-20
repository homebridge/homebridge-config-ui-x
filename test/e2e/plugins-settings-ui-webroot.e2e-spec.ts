import { resolve } from 'node:path'
import process from 'node:process'

import { HttpService } from '@nestjs/axios'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ConfigService } from '../../src/core/config/config.service'
import { Logger } from '../../src/core/logger/logger.service'
import { PluginsSettingsUiService } from '../../src/modules/custom-plugins/plugins-settings-ui/plugins-settings-ui.service'
import { PluginsService } from '../../src/modules/plugins/plugins.service'

describe('PluginsSettingsUiService Webroot (e2e)', () => {
  let pluginsSettingsUiService: PluginsSettingsUiService
  let mockConfigService: any
  let mockPluginUi: any

  beforeEach(() => {
    process.env.UIX_BASE_PATH = resolve(__dirname, '../../')

    // Mock ConfigService with webroot settings
    mockConfigService = {
      package: {
        version: '5.4.1',
      },
      ui: {
        webroot: '',
      },
      uiSettings: vi.fn().mockReturnValue({
        env: { production: true },
      }),
    }

    // Mock PluginsService
    const mockPluginsService = {
      getPluginUiMetadata: vi.fn(),
    }

    // Mock Logger
    const mockLogger = {
      warn: vi.fn(),
      error: vi.fn(),
      log: vi.fn(),
      debug: vi.fn(),
    }

    // Mock HttpService
    const mockHttpService = {
      get: vi.fn(),
    }

    // Mock plugin UI metadata
    mockPluginUi = {
      plugin: {
        name: 'homebridge-test-plugin',
        displayName: 'Test Plugin',
        installedVersion: '1.0.0',
      },
      publicPath: '/path/to/plugin/public',
      serverPath: '/path/to/plugin/server.js',
      devServer: null,
    }

    pluginsSettingsUiService = new PluginsSettingsUiService(
      mockLogger as unknown as Logger,
      mockPluginsService as unknown as PluginsService,
      mockConfigService as ConfigService,
      mockHttpService as unknown as HttpService,
    )

    // Mock the getIndexHtmlBody method
    pluginsSettingsUiService.getIndexHtmlBody = vi.fn().mockResolvedValue('<div>Mock Plugin UI</div>')
  })

  describe('buildIndexHtml', () => {
    it('should include webroot in script src when webroot is set', async () => {
      mockConfigService.ui.webroot = '/homebridge'
      const origin = 'https://example.com'

      const html = await pluginsSettingsUiService.buildIndexHtml(mockPluginUi, origin)

      expect(html).toContain('src="https://example.com/homebridge/assets/plugin-ui-utils/ui.js?v=5.4.1"')
    })

    it('should not include webroot in script src when webroot is empty', async () => {
      mockConfigService.ui.webroot = ''
      const origin = 'https://example.com'

      const html = await pluginsSettingsUiService.buildIndexHtml(mockPluginUi, origin)

      expect(html).toContain('src="https://example.com/assets/plugin-ui-utils/ui.js?v=5.4.1"')
    })

    it('should not include webroot in script src when webroot is null', async () => {
      mockConfigService.ui.webroot = null
      const origin = 'https://example.com'

      const html = await pluginsSettingsUiService.buildIndexHtml(mockPluginUi, origin)

      expect(html).toContain('src="https://example.com/assets/plugin-ui-utils/ui.js?v=5.4.1"')
    })

    it('should not include webroot in script src when webroot is undefined', async () => {
      mockConfigService.ui.webroot = undefined
      const origin = 'https://example.com'

      const html = await pluginsSettingsUiService.buildIndexHtml(mockPluginUi, origin)

      expect(html).toContain('src="https://example.com/assets/plugin-ui-utils/ui.js?v=5.4.1"')
    })

    it('should handle complex webroot paths', async () => {
      mockConfigService.ui.webroot = '/apps/smart-home/homebridge'
      const origin = 'https://example.com'

      const html = await pluginsSettingsUiService.buildIndexHtml(mockPluginUi, origin)

      expect(html).toContain('src="https://example.com/apps/smart-home/homebridge/assets/plugin-ui-utils/ui.js?v=5.4.1"')
    })

    it('should handle webroot with trailing slash', async () => {
      mockConfigService.ui.webroot = '/homebridge/'
      const origin = 'https://example.com'

      const html = await pluginsSettingsUiService.buildIndexHtml(mockPluginUi, origin)

      expect(html).toContain('src="https://example.com/homebridge//assets/plugin-ui-utils/ui.js?v=5.4.1"')
    })

    it('should use fallback origin when origin is not provided', async () => {
      mockConfigService.ui.webroot = '/homebridge'

      const html = await pluginsSettingsUiService.buildIndexHtml(mockPluginUi, null)

      expect(html).toContain('src="http://localhost:4200/assets/plugin-ui-utils/ui.js?v=5.4.1"')
    })

    it('should include correct plugin metadata in window._homebridge', async () => {
      mockConfigService.ui.webroot = '/homebridge'
      const origin = 'https://example.com'

      const html = await pluginsSettingsUiService.buildIndexHtml(mockPluginUi, origin)

      expect(html).toContain('window._homebridge = {')
      expect(html).toContain(JSON.stringify(mockPluginUi.plugin))
      expect(html).toContain(JSON.stringify(mockConfigService.uiSettings(true)))
    })

    it('should include version parameter in script URL', async () => {
      mockConfigService.ui.webroot = '/homebridge'
      mockConfigService.package.version = '5.5.0'
      const origin = 'https://example.com'

      const html = await pluginsSettingsUiService.buildIndexHtml(mockPluginUi, origin)

      expect(html).toContain('src="https://example.com/homebridge/assets/plugin-ui-utils/ui.js?v=5.5.0"')
    })

    it('should generate valid HTML structure', async () => {
      mockConfigService.ui.webroot = '/test'
      const origin = 'https://example.com'

      const html = await pluginsSettingsUiService.buildIndexHtml(mockPluginUi, origin)

      expect(html).toMatch(/<!doctype html>/)
      expect(html).toContain('<html>')
      expect(html).toContain('<head>')
      expect(html).toContain('<title>homebridge-test-plugin</title>')
      expect(html).toContain('<meta name="viewport" content="width=device-width, initial-scale=1">')
      expect(html).toContain('<body style="display:none;">')
      expect(html).toContain('window.parent.postMessage({action: \'loaded\'}, \'*\');')
      expect(html).toContain('</html>')
    })

    it('should handle special characters in webroot', async () => {
      mockConfigService.ui.webroot = '/my-app_test'
      const origin = 'https://example.com:8581'

      const html = await pluginsSettingsUiService.buildIndexHtml(mockPluginUi, origin)

      expect(html).toContain('src="https://example.com:8581/my-app_test/assets/plugin-ui-utils/ui.js?v=5.4.1"')
    })

    it('should work with different origins', async () => {
      mockConfigService.ui.webroot = '/homebridge'

      const testCases = [
        'http://localhost:8581',
        'https://homebridge.local',
        'http://192.168.1.100:8581',
        'https://my-server.com:443',
      ]

      for (const origin of testCases) {
        const html = await pluginsSettingsUiService.buildIndexHtml(mockPluginUi, origin)
        expect(html).toContain(`src="${origin}/homebridge/assets/plugin-ui-utils/ui.js?v=5.4.1"`)
      }
    })
  })

  describe('edge cases', () => {
    it('should handle empty plugin name', async () => {
      mockPluginUi.plugin.name = ''
      mockConfigService.ui.webroot = '/homebridge'
      const origin = 'https://example.com'

      const html = await pluginsSettingsUiService.buildIndexHtml(mockPluginUi, origin)

      expect(html).toContain('<title></title>')
      expect(html).toContain('src="https://example.com/homebridge/assets/plugin-ui-utils/ui.js?v=5.4.1"')
    })

    it('should handle missing package version', async () => {
      mockConfigService.package.version = undefined
      mockConfigService.ui.webroot = '/homebridge'
      const origin = 'https://example.com'

      const html = await pluginsSettingsUiService.buildIndexHtml(mockPluginUi, origin)

      expect(html).toContain('src="https://example.com/homebridge/assets/plugin-ui-utils/ui.js?v=undefined"')
    })

    it('should escape special characters in plugin metadata', async () => {
      mockPluginUi.plugin.displayName = 'Test "Plugin" with <special> & characters'
      mockConfigService.ui.webroot = '/homebridge'
      const origin = 'https://example.com'

      const html = await pluginsSettingsUiService.buildIndexHtml(mockPluginUi, origin)

      // Should contain properly escaped JSON
      expect(html).toContain('window._homebridge = {')
      expect(html).toContain(JSON.stringify(mockPluginUi.plugin))
    })
  })
})

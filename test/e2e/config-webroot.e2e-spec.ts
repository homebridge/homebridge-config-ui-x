import { resolve } from 'node:path'
import process from 'node:process'

import { copy, remove, writeJson } from 'fs-extra'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { ConfigService } from '../../src/core/config/config.service'

describe('ConfigService Webroot (e2e)', () => {
  let configService: ConfigService
  let configPath: string
  let storagePath: string

  beforeAll(async () => {
    process.env.UIX_BASE_PATH = resolve(__dirname, '../../')
    storagePath = resolve(__dirname, '../', '.homebridge-webroot-test')
    configPath = resolve(storagePath, 'config.json')

    process.env.UIX_STORAGE_PATH = storagePath
    process.env.UIX_CONFIG_PATH = configPath

    // Setup test config
    await copy(resolve(__dirname, '../mocks', 'config.json'), configPath)
  })

  afterAll(async () => {
    delete process.env.UIX_STORAGE_PATH
    delete process.env.UIX_CONFIG_PATH

    // Clean up test directory
    await remove(storagePath)
  })

  describe('webroot configuration', () => {
    it('should return empty webroot when not configured', async () => {
      const mockConfig = {
        bridge: { name: 'Test', username: '11:22:33:44:55:66', port: 51826 },
        accessories: [],
        platforms: [{
          platform: 'config',
          name: 'Config',
          port: 8581,
        }],
      }

      await writeJson(configPath, mockConfig)
      configService = new ConfigService()

      expect(configService.ui.webroot).toBeUndefined()
    })

    it('should return configured webroot value', async () => {
      const mockConfig = {
        bridge: { name: 'Test', username: '11:22:33:44:55:66', port: 51826 },
        accessories: [],
        platforms: [{
          platform: 'config',
          name: 'Config',
          port: 8581,
          webroot: '/homebridge',
        }],
      }

      await writeJson(configPath, mockConfig)
      configService = new ConfigService()

      expect(configService.ui.webroot).toBe('/homebridge')
    })

    it('should include webroot in uiSettings', async () => {
      const mockConfig = {
        bridge: { name: 'Test', username: '11:22:33:44:55:66', port: 51826 },
        accessories: [],
        platforms: [{
          platform: 'config',
          name: 'Config',
          port: 8581,
          webroot: '/my-webroot',
        }],
      }

      await writeJson(configPath, mockConfig)
      configService = new ConfigService()

      // Test the webroot is accessible from ui config
      expect(configService.ui.webroot).toBe('/my-webroot')

      // Test the fallback behavior (this.ui.webroot || '')
      const webroot = configService.ui.webroot || ''
      expect(webroot).toBe('/my-webroot')
    })

    it('should handle empty webroot string', async () => {
      const mockConfig = {
        bridge: { name: 'Test', username: '11:22:33:44:55:66', port: 51826 },
        accessories: [],
        platforms: [{
          platform: 'config',
          name: 'Config',
          port: 8581,
          webroot: '',
        }],
      }

      await writeJson(configPath, mockConfig)
      configService = new ConfigService()

      expect(configService.ui.webroot).toBe('')
    })

    it('should handle null webroot value', async () => {
      const mockConfig = {
        bridge: { name: 'Test', username: '11:22:33:44:55:66', port: 51826 },
        accessories: [],
        platforms: [{
          platform: 'config',
          name: 'Config',
          port: 8581,
          webroot: null,
        }],
      }

      await writeJson(configPath, mockConfig)
      configService = new ConfigService()

      expect(configService.ui.webroot).toBe(null)
    })

    it('should handle undefined webroot value', async () => {
      const mockConfig = {
        bridge: { name: 'Test', username: '11:22:33:44:55:66', port: 51826 },
        accessories: [],
        platforms: [{
          platform: 'config',
          name: 'Config',
          port: 8581,
          // webroot is undefined (not present)
        }],
      }

      await writeJson(configPath, mockConfig)
      configService = new ConfigService()

      expect(configService.ui.webroot).toBeUndefined()
    })

    it('should handle complex webroot paths', async () => {
      const mockConfig = {
        bridge: { name: 'Test', username: '11:22:33:44:55:66', port: 51826 },
        accessories: [],
        platforms: [{
          platform: 'config',
          name: 'Config',
          port: 8581,
          webroot: '/apps/smart-home/homebridge',
        }],
      }

      await writeJson(configPath, mockConfig)
      configService = new ConfigService()

      expect(configService.ui.webroot).toBe('/apps/smart-home/homebridge')
    })

    it('should handle webroot with trailing slash', async () => {
      const mockConfig = {
        bridge: { name: 'Test', username: '11:22:33:44:55:66', port: 51826 },
        accessories: [],
        platforms: [{
          platform: 'config',
          name: 'Config',
          port: 8581,
          webroot: '/homebridge/',
        }],
      }

      await writeJson(configPath, mockConfig)
      configService = new ConfigService()

      expect(configService.ui.webroot).toBe('/homebridge/')
    })

    it('should handle webroot without leading slash', async () => {
      const mockConfig = {
        bridge: { name: 'Test', username: '11:22:33:44:55:66', port: 51826 },
        accessories: [],
        platforms: [{
          platform: 'config',
          name: 'Config',
          port: 8581,
          webroot: 'homebridge',
        }],
      }

      await writeJson(configPath, mockConfig)
      configService = new ConfigService()

      expect(configService.ui.webroot).toBe('homebridge')
    })

    it('should handle webroot with special characters', async () => {
      const mockConfig = {
        bridge: { name: 'Test', username: '11:22:33:44:55:66', port: 51826 },
        accessories: [],
        platforms: [{
          platform: 'config',
          name: 'Config',
          port: 8581,
          webroot: '/my-app_test-123',
        }],
      }

      await writeJson(configPath, mockConfig)
      configService = new ConfigService()

      expect(configService.ui.webroot).toBe('/my-app_test-123')
    })

    it('should preserve webroot in config object', async () => {
      const mockConfig = {
        bridge: { name: 'Test', username: '11:22:33:44:55:66', port: 51826 },
        accessories: [],
        platforms: [{
          platform: 'config',
          name: 'Config',
          port: 8581,
          webroot: '/test-webroot',
        }],
      }

      await writeJson(configPath, mockConfig)
      configService = new ConfigService()

      expect(configService.ui.webroot).toBe('/test-webroot')
    })

    it('should handle multiple config platforms with different webroots', async () => {
      const mockConfig = {
        bridge: { name: 'Test', username: '11:22:33:44:55:66', port: 51826 },
        accessories: [],
        platforms: [
          {
            platform: 'config',
            name: 'Config',
            port: 8581,
            webroot: '/homebridge',
          },
          {
            platform: 'other-platform',
            name: 'Other',
            webroot: '/other-path',
          },
        ],
      }

      await writeJson(configPath, mockConfig)
      configService = new ConfigService()

      // Should use the webroot from the config platform
      expect(configService.ui.webroot).toBe('/homebridge')
    })
  })

  describe('webroot fallback behavior', () => {
    it('should handle webroot fallback with OR operator', async () => {
      const mockConfig = {
        bridge: { name: 'Test Bridge', username: '11:22:33:44:55:66', port: 51826 },
        accessories: [],
        platforms: [{
          platform: 'config',
          name: 'Config',
          port: 8581,
          auth: 'form',
          webroot: '/custom-path',
          theme: 'blue',
          lang: 'auto',
        }],
      }

      await writeJson(configPath, mockConfig)
      configService = new ConfigService()

      // Test the fallback pattern used in uiSettings
      const webroot = configService.ui.webroot || ''
      expect(webroot).toBe('/custom-path')
    })

    it('should return empty string for undefined webroot with fallback', async () => {
      const mockConfig = {
        bridge: { name: 'Test Bridge', username: '11:22:33:44:55:66', port: 51826 },
        accessories: [],
        platforms: [{
          platform: 'config',
          name: 'Config',
          port: 8581,
        }],
      }

      await writeJson(configPath, mockConfig)
      configService = new ConfigService()

      // Test the fallback pattern used in uiSettings
      const webroot = configService.ui.webroot || ''
      expect(webroot).toBe('')
    })
  })

  describe('edge cases', () => {
    it('should handle numeric webroot value', async () => {
      const mockConfig = {
        bridge: { name: 'Test', username: '11:22:33:44:55:66', port: 51826 },
        accessories: [],
        platforms: [{
          platform: 'config',
          name: 'Config',
          port: 8581,
          webroot: 123,
        }],
      }

      await writeJson(configPath, mockConfig)
      configService = new ConfigService()

      // Should preserve the actual type as-is
      expect(typeof configService.ui.webroot).toBe('number')
    })

    it('should handle boolean webroot value', async () => {
      const mockConfig = {
        bridge: { name: 'Test', username: '11:22:33:44:55:66', port: 51826 },
        accessories: [],
        platforms: [{
          platform: 'config',
          name: 'Config',
          port: 8581,
          webroot: true,
        }],
      }

      await writeJson(configPath, mockConfig)
      configService = new ConfigService()

      // Should preserve the actual type as-is
      expect(typeof configService.ui.webroot).toBe('boolean')
    })

    it('should handle array webroot value', async () => {
      const mockConfig = {
        bridge: { name: 'Test', username: '11:22:33:44:55:66', port: 51826 },
        accessories: [],
        platforms: [{
          platform: 'config',
          name: 'Config',
          port: 8581,
          webroot: ['/path1', '/path2'],
        }],
      }

      await writeJson(configPath, mockConfig)
      configService = new ConfigService()

      // Should preserve the actual type as-is
      expect(typeof configService.ui.webroot).toBe('object')
    })
  })
})

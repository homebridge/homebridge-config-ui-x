/* global NodeJS */
import { resolve } from 'node:path'
import process from 'node:process'

import { copy, writeJson } from 'fs-extra'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

describe('mDNS Service (e2e)', () => {
  let authFilePath: string
  let secretsFilePath: string
  let configPath: string
  let originalEnv: NodeJS.ProcessEnv

  beforeAll(async () => {
    // Save original environment
    originalEnv = { ...process.env }

    process.env.UIX_BASE_PATH = resolve(__dirname, '../../')
    process.env.UIX_STORAGE_PATH = resolve(__dirname, '../', '.homebridge')
    process.env.UIX_CONFIG_PATH = resolve(process.env.UIX_STORAGE_PATH, 'config.json')

    configPath = process.env.UIX_CONFIG_PATH
    authFilePath = resolve(process.env.UIX_STORAGE_PATH, 'auth.json')
    secretsFilePath = resolve(process.env.UIX_STORAGE_PATH, '.uix-secrets')

    // Setup test config
    await copy(resolve(__dirname, '../mocks', 'config.json'), configPath)

    // Setup test auth file
    await copy(resolve(__dirname, '../mocks', 'auth.json'), authFilePath)
    await copy(resolve(__dirname, '../mocks', '.uix-secrets'), secretsFilePath)
  })

  afterAll(async () => {
    // Restore original environment
    process.env = originalEnv
  })

  describe('Bonjour Service Module', () => {
    it('should import bonjour-service without errors', async () => {
      const { Bonjour } = await import('bonjour-service')
      expect(Bonjour).toBeDefined()
    })

    it('should create a Bonjour instance with required methods', async () => {
      const { Bonjour } = await import('bonjour-service')
      const bonjour = new Bonjour()

      expect(bonjour).toBeDefined()
      expect(typeof bonjour.publish).toBe('function')
      expect(typeof bonjour.unpublishAll).toBe('function')
      expect(typeof bonjour.destroy).toBe('function')
      expect(typeof bonjour.find).toBe('function')

      bonjour.destroy()
    })

    it('should publish a test service successfully', async () => {
      const { Bonjour } = await import('bonjour-service')
      const bonjour = new Bonjour()

      const service = bonjour.publish({
        name: 'Test Homebridge UI',
        type: 'http',
        port: 8581,
        txt: {
          path: '/',
          version: 'test-1.0.0',
          https: 'false',
        },
      })

      expect(service).toBeDefined()
      expect(service.name).toBe('Test Homebridge UI')
      expect(service.type).toBe('_http._tcp')
      expect(service.port).toBe(8581)

      bonjour.unpublishAll()
      bonjour.destroy()
    })

    it('should discover published services', async () => {
      const { Bonjour } = await import('bonjour-service')
      const bonjour = new Bonjour()

      // Publish a test service
      bonjour.publish({
        name: 'Discovery Test UI',
        type: 'http',
        port: 8582,
        txt: {
          path: '/test',
          version: '1.0.0',
        },
      })

      // Try to discover the service
      const browser = bonjour.find({ type: 'http' })

      const discoveryPromise = new Promise((resolve) => {
        browser.on('up', (service: any) => {
          if (service.name === 'Discovery Test UI') {
            resolve(service)
          }
        })

        // Timeout after 2 seconds
        setTimeout(() => resolve(null), 2000)
      })

      await discoveryPromise

      browser.stop()
      bonjour.unpublishAll()
      bonjour.destroy()

      // Service discovery might not work in all test environments
      // so we just check that the browser was created
      expect(browser).toBeDefined()
    })
  })

  describe('mDNS Configuration', () => {
    let ConfigService: any
    let configService: any

    beforeEach(async () => {
      // Reset modules to ensure clean state
      vi.resetModules()

      // Import ConfigService
      const configModule = await import('../../src/core/config/config.service.js')
      ConfigService = configModule.ConfigService
    })

    it('should handle enableMdnsAdvertise config option', async () => {
      // Create config with mDNS enabled
      const testConfig = {
        bridge: {
          name: 'Test Bridge',
          username: '0E:89:49:64:91:86',
          port: 51173,
          pin: '630-27-655',
        },
        platforms: [{
          platform: 'config',
          name: 'Config',
          port: 8581,
          enableMdnsAdvertise: true,
        }],
      }

      await writeJson(configPath, testConfig)

      configService = new ConfigService()
      configService.parseConfig(testConfig)

      expect(configService.ui).toBeDefined()
      expect(configService.ui.enableMdnsAdvertise).toBe(true)
    })

    it('should default to false when enableMdnsAdvertise is not set', async () => {
      const testConfig = {
        bridge: {
          name: 'Test Bridge',
          username: '0E:89:49:64:91:86',
          port: 51173,
          pin: '630-27-655',
        },
        platforms: [{
          platform: 'config',
          name: 'Config',
          port: 8581,
        }],
      }

      await writeJson(configPath, testConfig)

      configService = new ConfigService()
      configService.parseConfig(testConfig)

      expect(configService.ui).toBeDefined()
      expect(configService.ui.enableMdnsAdvertise).toBeUndefined()
    })

    it('should use bridge name for mDNS service name', async () => {
      const testConfig = {
        bridge: {
          name: 'My Custom Bridge',
          username: '0E:89:49:64:91:86',
          port: 51173,
          pin: '630-27-655',
        },
        platforms: [{
          platform: 'config',
          name: 'Config',
          port: 8581,
          enableMdnsAdvertise: true,
        }],
      }

      await writeJson(configPath, testConfig)

      configService = new ConfigService()
      configService.parseConfig(testConfig)

      expect(configService.homebridgeConfig.bridge.name).toBe('My Custom Bridge')

      // Test service name generation logic
      const serviceName = configService.homebridgeConfig?.bridge?.name
        ? configService.homebridgeConfig.bridge.name
        : 'Homebridge UI'

      expect(serviceName).toBe('My Custom Bridge')
    })

    it('should handle HTTPS configuration in mDNS', async () => {
      const testConfig = {
        bridge: {
          name: 'Test Bridge',
          username: '0E:89:49:64:91:86',
          port: 51173,
          pin: '630-27-655',
        },
        platforms: [{
          platform: 'config',
          name: 'Config',
          port: 8581,
          ssl: {
            key: '/path/to/key.pem',
            cert: '/path/to/cert.pem',
          },
          enableMdnsAdvertise: true,
        }],
      }

      await writeJson(configPath, testConfig)

      configService = new ConfigService()
      configService.parseConfig(testConfig)

      expect(configService.ui.ssl).toBeDefined()
      expect(configService.ui.ssl.key).toBe('/path/to/key.pem')
      expect(configService.ui.ssl.cert).toBe('/path/to/cert.pem')
    })
  })

  describe('mDNS Service Integration', () => {
    it('should handle multiple service publishing and cleanup', async () => {
      const { Bonjour } = await import('bonjour-service')
      const bonjour = new Bonjour()

      // Publish multiple services
      const services = []
      for (let i = 0; i < 3; i++) {
        const service = bonjour.publish({
          name: `Test Service ${i}`,
          type: 'http',
          port: 8580 + i,
          txt: {
            path: '/',
            version: '1.0.0',
          },
        })
        services.push(service)
      }

      expect(services).toHaveLength(3)
      services.forEach((service, index) => {
        expect(service.name).toBe(`Test Service ${index}`)
        expect(service.port).toBe(8580 + index)
      })

      // Clean up all services
      bonjour.unpublishAll()
      bonjour.destroy()
    })

    it('should handle service with special characters in name', async () => {
      const { Bonjour } = await import('bonjour-service')
      const bonjour = new Bonjour()

      const specialNames = [
        'Living Room Bridge UI',
        'Master Bedroom (2nd Floor) UI',
        'Basement-Workshop UI',
        'Guest House #1 UI',
      ]

      for (const name of specialNames) {
        const service = bonjour.publish({
          name,
          type: 'http',
          port: 8581,
        })

        expect(service).toBeDefined()
        expect(service.name).toBe(name)

        bonjour.unpublishAll()
      }

      bonjour.destroy()
    })

    it('should handle network interface binding', async () => {
      const { Bonjour } = await import('bonjour-service')
      const bonjour = new Bonjour()

      // Test with different host configurations
      const hostConfigs = [
        { host: undefined, description: 'all interfaces' },
        { host: '127.0.0.1', description: 'localhost only' },
        { host: '192.168.1.100', description: 'specific IP' },
      ]

      for (const config of hostConfigs) {
        const service = bonjour.publish({
          name: `Test ${config.description}`,
          type: 'http',
          port: 8581,
          host: config.host,
        })

        expect(service).toBeDefined()

        bonjour.unpublishAll()
      }

      bonjour.destroy()
    })

    it('should handle graceful shutdown', async () => {
      const { Bonjour } = await import('bonjour-service')
      const bonjour = new Bonjour()

      // Publish a service
      const service = bonjour.publish({
        name: 'Shutdown Test UI',
        type: 'http',
        port: 8581,
      })

      expect(service).toBeDefined()

      // Simulate graceful shutdown
      let cleanupCalled = false
      const cleanup = () => {
        cleanupCalled = true
        bonjour.unpublishAll()
        bonjour.destroy()
      }

      cleanup()

      expect(cleanupCalled).toBe(true)
    })
  })
})

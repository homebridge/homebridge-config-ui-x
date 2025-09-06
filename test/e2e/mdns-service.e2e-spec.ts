import { resolve } from 'node:path'
import process from 'node:process'

import { copy } from 'fs-extra'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

describe('mDNS Service (e2e)', () => {
  let authFilePath: string
  let secretsFilePath: string

  beforeAll(async () => {
    process.env.UIX_BASE_PATH = resolve(__dirname, '../../')
    process.env.UIX_STORAGE_PATH = resolve(__dirname, '../', '.homebridge')
    process.env.UIX_CONFIG_PATH = resolve(process.env.UIX_STORAGE_PATH, 'config.json')

    authFilePath = resolve(process.env.UIX_STORAGE_PATH, 'auth.json')
    secretsFilePath = resolve(process.env.UIX_STORAGE_PATH, '.uix-secrets')

    // Setup test config
    await copy(resolve(__dirname, '../mocks', 'config.json'), process.env.UIX_CONFIG_PATH)

    // Setup test auth file
    await copy(resolve(__dirname, '../mocks', 'auth.json'), authFilePath)
    await copy(resolve(__dirname, '../mocks', '.uix-secrets'), secretsFilePath)
  })

  it('should import bonjour-service without errors', async () => {
    // Test that the bonjour-service module can be imported
    const { Bonjour } = await import('bonjour-service')
    expect(Bonjour).toBeDefined()

    // Test that we can create a Bonjour instance
    const bonjour = new Bonjour()
    expect(bonjour).toBeDefined()

    // Test that the publish method exists
    expect(typeof bonjour.publish).toBe('function')
    expect(typeof bonjour.unpublishAll).toBe('function')
    expect(typeof bonjour.destroy).toBe('function')

    // Clean up
    bonjour.destroy()
  })

  afterAll(async () => {
    // Clean up any test files if needed
  })
})

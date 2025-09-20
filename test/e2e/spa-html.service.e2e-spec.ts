import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import process from 'node:process'

import { ensureDir, readFile, remove, writeFile } from 'fs-extra'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { SpaHtmlService } from '../../src/core/spa/spa-html.service'

describe('SpaHtmlService (e2e)', () => {
  let tempDir: string
  let tempIndexPath: string
  let originalHtml: string
  let originalBasePath: string

  beforeAll(async () => {
    // Create a temporary directory for testing
    tempDir = resolve(tmpdir(), 'spa-html-service-test')
    await ensureDir(resolve(tempDir, 'public'))

    // Override UIX_BASE_PATH to use our temp directory
    originalBasePath = process.env.UIX_BASE_PATH
    process.env.UIX_BASE_PATH = tempDir
    tempIndexPath = resolve(tempDir, 'public/index.html')

    // Create a mock index.html for testing
    originalHtml = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Homebridge Config UI X</title>
  <base href="/" />
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <link rel="icon" type="image/x-icon" href="/favicon.ico">
  <link rel="apple-touch-icon" href="/apple-touch-icon.png">
  <link rel="manifest" href="/manifest.webmanifest">
  <link href="/assets/styles.css" rel="stylesheet">
</head>
<body>
  <app-root></app-root>
  <script src="/assets/main.js"></script>
</body>
</html>`

    await writeFile(tempIndexPath, originalHtml)
  })

  afterAll(async () => {
    // Clean up temp directory first
    await remove(tempDir)

    // Restore original environment
    if (originalBasePath) {
      process.env.UIX_BASE_PATH = originalBasePath
    } else {
      delete process.env.UIX_BASE_PATH
    }
  })

  describe('updateIndexHtml', () => {
    it('should update base href for webroot path', async () => {
      const webroot = '/homebridge'

      await SpaHtmlService.updateIndexHtml(webroot)

      const updatedHtml = await readFile(tempIndexPath, 'utf-8')
      expect(updatedHtml).toContain('<base href="/homebridge/" />')
    })

    it('should handle webroot with trailing slash', async () => {
      const webroot = '/homebridge/'

      await SpaHtmlService.updateIndexHtml(webroot)

      const updatedHtml = await readFile(tempIndexPath, 'utf-8')
      expect(updatedHtml).toContain('<base href="/homebridge/" />')
    })

    it('should handle webroot without leading slash', async () => {
      const webroot = 'homebridge'

      await SpaHtmlService.updateIndexHtml(webroot)

      const updatedHtml = await readFile(tempIndexPath, 'utf-8')
      expect(updatedHtml).toContain('<base href="/homebridge/" />')
    })

    it('should restore original HTML when webroot is empty', async () => {
      // First set a webroot
      await SpaHtmlService.updateIndexHtml('/homebridge')

      // Then clear it
      await SpaHtmlService.updateIndexHtml('')

      const restoredHtml = await readFile(tempIndexPath, 'utf-8')
      expect(restoredHtml).toContain('<base href="/" />')
      expect(restoredHtml).toContain('href="assets/')
      expect(restoredHtml).toContain('href="favicon.ico"')
    })

    it('should restore original HTML when webroot is null', async () => {
      // First set a webroot
      await SpaHtmlService.updateIndexHtml('/homebridge')

      // Then clear it with null
      await SpaHtmlService.updateIndexHtml(null)

      const restoredHtml = await readFile(tempIndexPath, 'utf-8')
      expect(restoredHtml).toContain('<base href="/" />')
    })

    it('should handle complex webroot paths', async () => {
      const webroot = '/my/complex/path'

      await SpaHtmlService.updateIndexHtml(webroot)

      const updatedHtml = await readFile(tempIndexPath, 'utf-8')
      expect(updatedHtml).toContain('<base href="/my/complex/path/" />')
      expect(updatedHtml).toContain('href="assets/')
    })

    it('should handle multiple webroot updates correctly', async () => {
      // Test that multiple updates work correctly
      await SpaHtmlService.updateIndexHtml('/first')
      let updatedHtml = await readFile(tempIndexPath, 'utf-8')
      expect(updatedHtml).toContain('<base href="/first/" />')

      await SpaHtmlService.updateIndexHtml('/second')
      updatedHtml = await readFile(tempIndexPath, 'utf-8')
      expect(updatedHtml).toContain('<base href="/second/" />')
      expect(updatedHtml).not.toContain('/first/')
    })
  })

  describe('edge cases', () => {
    it('should handle file not found gracefully', async () => {
      const originalPath = process.env.UIX_BASE_PATH
      process.env.UIX_BASE_PATH = '/nonexistent/path'

      await expect(SpaHtmlService.updateIndexHtml('/test')).resolves.toBeUndefined()

      process.env.UIX_BASE_PATH = originalPath
    })

    it('should handle multiple consecutive updates', async () => {
      await SpaHtmlService.updateIndexHtml('/first')
      await SpaHtmlService.updateIndexHtml('/second')
      await SpaHtmlService.updateIndexHtml('/third')

      const finalHtml = await readFile(tempIndexPath, 'utf-8')
      expect(finalHtml).toContain('<base href="/third/" />')
      expect(finalHtml).toContain('href="assets/')
    })
  })
})

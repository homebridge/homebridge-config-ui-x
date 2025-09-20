import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import process from 'node:process'

import { NotFoundException } from '@nestjs/common'
import { ensureDir, remove, writeFile } from 'fs-extra'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { SpaFilter } from '../../src/core/spa/spa.filter'

describe('SpaFilter (e2e)', () => {
  let spaFilter: SpaFilter
  let mockResponse: any
  let mockRequest: any
  let mockHost: any
  let tempDir: string
  let tempIndexPath: string
  let originalBasePath: string

  beforeAll(async () => {
    // Create a temporary directory for testing
    tempDir = resolve(tmpdir(), 'spa-filter-test')
    await ensureDir(resolve(tempDir, 'public'))

    // Override UIX_BASE_PATH to use our temp directory
    originalBasePath = process.env.UIX_BASE_PATH
    process.env.UIX_BASE_PATH = tempDir
    tempIndexPath = resolve(tempDir, 'public/index.html')

    // Create a mock index.html for testing
    const mockHtml = `<!doctype html>
<html><head><title>Test</title></head><body><div>Test Content</div></body></html>`

    await writeFile(tempIndexPath, mockHtml)
  })

  afterAll(async () => {
    // Restore original environment and clean up
    if (originalBasePath) {
      process.env.UIX_BASE_PATH = originalBasePath
    } else {
      delete process.env.UIX_BASE_PATH
    }
    await remove(tempDir)
  })

  beforeEach(() => {
    // Reset environment variable before each test
    delete process.env.UIX_ORIGINAL_WEBROOT

    mockResponse = {
      code: vi.fn().mockReturnThis(),
      send: vi.fn().mockReturnThis(),
      type: vi.fn().mockReturnThis(),
      header: vi.fn().mockReturnThis(),
    }

    mockRequest = {
      url: '/',
    }

    mockHost = {
      switchToHttp: vi.fn().mockReturnValue({
        getRequest: vi.fn().mockReturnValue(mockRequest),
        getResponse: vi.fn().mockReturnValue(mockResponse),
      }),
    }
  })

  describe('without webroot', () => {
    beforeEach(() => {
      spaFilter = new SpaFilter()
    })

    it('should serve index.html for root path', () => {
      mockRequest.url = '/'

      spaFilter.catch(new NotFoundException(), mockHost)

      expect(mockResponse.type).toHaveBeenCalledWith('text/html')
      expect(mockResponse.header).toHaveBeenCalledWith('Cache-Control', 'no-cache, no-store, must-revalidate')
      expect(mockResponse.send).toHaveBeenCalled()
    })

    it('should serve index.html for any app route', () => {
      mockRequest.url = '/plugins'

      spaFilter.catch(new NotFoundException(), mockHost)

      expect(mockResponse.type).toHaveBeenCalledWith('text/html')
      expect(mockResponse.send).toHaveBeenCalled()
    })

    it('should return 404 for API requests', () => {
      mockRequest.url = '/api/status'

      spaFilter.catch(new NotFoundException(), mockHost)

      expect(mockResponse.code).toHaveBeenCalledWith(404)
      expect(mockResponse.send).toHaveBeenCalledWith('Not Found')
    })

    it('should return 404 for socket.io requests', () => {
      mockRequest.url = '/socket.io/test'

      spaFilter.catch(new NotFoundException(), mockHost)

      expect(mockResponse.code).toHaveBeenCalledWith(404)
      expect(mockResponse.send).toHaveBeenCalledWith('Not Found')
    })

    it('should return 404 for asset requests', () => {
      mockRequest.url = '/assets/main.js'

      spaFilter.catch(new NotFoundException(), mockHost)

      expect(mockResponse.code).toHaveBeenCalledWith(404)
      expect(mockResponse.send).toHaveBeenCalledWith('Not Found')
    })

    it('should return 404 for swagger requests', () => {
      mockRequest.url = '/swagger/index.html'

      spaFilter.catch(new NotFoundException(), mockHost)

      expect(mockResponse.code).toHaveBeenCalledWith(404)
      expect(mockResponse.send).toHaveBeenCalledWith('Not Found')
    })

    it('should return 404 for static file extensions', () => {
      const staticFiles = [
        '/test.js',
        '/style.css',
        '/image.png',
        '/photo.jpg',
        '/doc.pdf',
        '/icon.svg',
        '/favicon.ico',
        '/font.woff',
        '/font.woff2',
        '/font.ttf',
        '/font.eot',
        '/manifest.webmanifest',
      ]

      staticFiles.forEach((url) => {
        mockRequest.url = url
        spaFilter.catch(new NotFoundException(), mockHost)
        expect(mockResponse.code).toHaveBeenCalledWith(404)
        expect(mockResponse.send).toHaveBeenCalledWith('Not Found')
      })
    })
  })

  describe('with webroot', () => {
    beforeEach(() => {
      process.env.UIX_ORIGINAL_WEBROOT = '/homebridge'
      spaFilter = new SpaFilter()
    })

    it('should serve index.html for webroot path', () => {
      mockRequest.url = '/homebridge/'

      spaFilter.catch(new NotFoundException(), mockHost)

      expect(mockResponse.type).toHaveBeenCalledWith('text/html')
      expect(mockResponse.send).toHaveBeenCalled()
    })

    it('should serve index.html for app routes under webroot', () => {
      mockRequest.url = '/homebridge/plugins'

      spaFilter.catch(new NotFoundException(), mockHost)

      expect(mockResponse.type).toHaveBeenCalledWith('text/html')
      expect(mockResponse.send).toHaveBeenCalled()
    })

    it('should return 404 for requests outside webroot', () => {
      mockRequest.url = '/other-app'

      spaFilter.catch(new NotFoundException(), mockHost)

      expect(mockResponse.code).toHaveBeenCalledWith(404)
      expect(mockResponse.send).toHaveBeenCalledWith('Not Found')
    })

    it('should return 404 for root path when webroot is set', () => {
      mockRequest.url = '/'

      spaFilter.catch(new NotFoundException(), mockHost)

      expect(mockResponse.code).toHaveBeenCalledWith(404)
      expect(mockResponse.send).toHaveBeenCalledWith('Not Found')
    })

    it('should return 404 for API requests under webroot', () => {
      mockRequest.url = '/homebridge/api/status'

      spaFilter.catch(new NotFoundException(), mockHost)

      expect(mockResponse.code).toHaveBeenCalledWith(404)
      expect(mockResponse.send).toHaveBeenCalledWith('Not Found')
    })

    it('should return 404 for asset requests under webroot', () => {
      mockRequest.url = '/homebridge/assets/main.js'

      spaFilter.catch(new NotFoundException(), mockHost)

      expect(mockResponse.code).toHaveBeenCalledWith(404)
      expect(mockResponse.send).toHaveBeenCalledWith('Not Found')
    })

    it('should return 404 for socket.io requests under webroot', () => {
      mockRequest.url = '/homebridge/socket.io/test'

      spaFilter.catch(new NotFoundException(), mockHost)

      expect(mockResponse.code).toHaveBeenCalledWith(404)
      expect(mockResponse.send).toHaveBeenCalledWith('Not Found')
    })

    it('should return 404 for swagger requests under webroot', () => {
      mockRequest.url = '/homebridge/swagger/index.html'

      spaFilter.catch(new NotFoundException(), mockHost)

      expect(mockResponse.code).toHaveBeenCalledWith(404)
      expect(mockResponse.send).toHaveBeenCalledWith('Not Found')
    })

    it('should handle nested webroot paths', () => {
      process.env.UIX_ORIGINAL_WEBROOT = '/apps/homebridge'
      spaFilter = new SpaFilter()

      mockRequest.url = '/apps/homebridge/status'

      spaFilter.catch(new NotFoundException(), mockHost)

      expect(mockResponse.type).toHaveBeenCalledWith('text/html')
      expect(mockResponse.send).toHaveBeenCalled()
    })

    it('should correctly strip webroot from URL for pattern matching', () => {
      mockRequest.url = '/homebridge/settings'

      spaFilter.catch(new NotFoundException(), mockHost)

      // Should serve SPA because /settings is not an API/asset/socket route
      expect(mockResponse.type).toHaveBeenCalledWith('text/html')
      expect(mockResponse.send).toHaveBeenCalled()
    })
  })

  describe('edge cases', () => {
    it('should handle empty webroot environment variable', () => {
      process.env.UIX_ORIGINAL_WEBROOT = ''
      spaFilter = new SpaFilter()

      mockRequest.url = '/plugins'

      spaFilter.catch(new NotFoundException(), mockHost)

      expect(mockResponse.type).toHaveBeenCalledWith('text/html')
      expect(mockResponse.send).toHaveBeenCalled()
    })

    it('should handle undefined webroot environment variable', () => {
      delete process.env.UIX_ORIGINAL_WEBROOT
      spaFilter = new SpaFilter()

      mockRequest.url = '/plugins'

      spaFilter.catch(new NotFoundException(), mockHost)

      expect(mockResponse.type).toHaveBeenCalledWith('text/html')
      expect(mockResponse.send).toHaveBeenCalled()
    })

    it('should handle webroot with special regex characters', () => {
      process.env.UIX_ORIGINAL_WEBROOT = '/app[test]'
      spaFilter = new SpaFilter()

      mockRequest.url = '/app[test]/status'

      spaFilter.catch(new NotFoundException(), mockHost)

      expect(mockResponse.type).toHaveBeenCalledWith('text/html')
      expect(mockResponse.send).toHaveBeenCalled()
    })

    it('should set proper cache headers', () => {
      spaFilter = new SpaFilter() // Ensure clean instance
      mockRequest.url = '/plugins'

      spaFilter.catch(new NotFoundException(), mockHost)

      expect(mockResponse.header).toHaveBeenCalledWith('Cache-Control', 'no-cache, no-store, must-revalidate')
      expect(mockResponse.header).toHaveBeenCalledWith('Pragma', 'no-cache')
      expect(mockResponse.header).toHaveBeenCalledWith('Expires', '0')
    })
  })
})

import type { ArgumentsHost, ExceptionFilter, HttpException } from '@nestjs/common'

import { resolve } from 'node:path'
import process from 'node:process'

import { Catch, NotFoundException } from '@nestjs/common'
import { readFileSync } from 'fs-extra'

import '../../globalDefaults'

@Catch(NotFoundException)
export class SpaFilter implements ExceptionFilter {
  private readonly webroot: string

  constructor() {
    const envWebroot = process.env.UIX_ORIGINAL_WEBROOT
    this.webroot = (envWebroot && envWebroot !== globalThis.webroot.errorCode)
      ? envWebroot
      : ''
  }

  catch(_exception: HttpException, host: ArgumentsHost) {
    const ctx = host.switchToHttp()
    const req = ctx.getRequest()
    const res = ctx.getResponse()

    // Check if request is for API, socket.io, assets, or static files (adjusted for webroot)
    const urlWithoutWebroot = this.webroot ? req.url.replace(new RegExp(`^${this.webroot}`), '') : req.url

    if (urlWithoutWebroot.startsWith('/api/')
      || urlWithoutWebroot.startsWith('/socket.io')
      || urlWithoutWebroot.startsWith('/assets')
      || urlWithoutWebroot.startsWith('/swagger')
      || urlWithoutWebroot.match(/\.(js|css|png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|eot|webmanifest)$/)) {
      return res.code(404).send('Not Found')
    }

    // Only serve SPA for requests that start with webroot (or all requests if no webroot)
    if (this.webroot && !req.url.startsWith(this.webroot)) {
      return res.code(404).send('Not Found')
    }

    const file = readFileSync(resolve(process.env.UIX_BASE_PATH, 'public/index.html'), 'utf-8')
    res.type('text/html')
    res.header('Cache-Control', 'no-cache, no-store, must-revalidate')
    res.header('Pragma', 'no-cache')
    res.header('Expires', '0')
    res.send(file)
  }
}

import type { ArgumentsHost, ExceptionFilter } from '@nestjs/common'

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import process from 'node:process'

import { Catch, NotFoundException } from '@nestjs/common'

@Catch(NotFoundException)
export class SpaFilter implements ExceptionFilter {
  // The single page app's index.html, read once: it does not change while the UI runs (an update restarts it)
  private indexHtml: string | undefined

  catch(exception: NotFoundException, host: ArgumentsHost) {
    const ctx = host.switchToHttp()
    const req = ctx.getRequest()
    const res = ctx.getResponse()

    if (req.url.startsWith('/api/')) {
      // Keep the reason a route gave ("Plugin x is not installed."), in Nest's usual JSON shape, which the UI's
      // error toasts read. Every API 404 used to become a bare "Not Found".
      return res.code(404).send(exception.getResponse())
    }

    if (req.url.startsWith('/socket.io') || req.url.startsWith('/assets')) {
      return res.code(404).send('Not Found')
    }

    this.indexHtml ??= readFileSync(resolve(process.env.UIX_BASE_PATH, 'public/index.html'), 'utf-8')
    res.type('text/html')
    res.header('Cache-Control', 'no-cache, no-store, must-revalidate')
    res.header('Pragma', 'no-cache')
    res.header('Expires', '0')
    res.send(this.indexHtml)
  }
}

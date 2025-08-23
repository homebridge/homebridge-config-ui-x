import { resolve } from 'node:path'
import process from 'node:process'

import { exists, readFile, writeFile } from 'fs-extra'

export class SpaHtmlService {
  /**
   * Updates the index.html file to use the specified webroot
   * @param webroot The webroot path (can include leading/trailing slashes, will be normalized)
   */
  static async updateIndexHtml(webroot: string): Promise<void> {
    const indexPath = resolve(process.env.UIX_BASE_PATH, 'public/index.html')
    if (!(await exists(indexPath))) {
      return
    }
    const originalHtml = await readFile(indexPath, 'utf-8')
    const normalizedWebroot = this.normalizeWebroot(webroot)
    const modifiedHtml = this.transformHtmlForWebroot(originalHtml, normalizedWebroot)
    await writeFile(indexPath, modifiedHtml)
  }

  /**
   * Normalizes webroot by removing leading/trailing slashes
   * @param webroot Raw webroot string
   * @returns Normalized webroot (empty string if no webroot)
   */
  private static normalizeWebroot(webroot: string): string {
    if (!webroot || webroot === '/') {
      return ''
    }

    return webroot.replace(/\/+/g, '/').replace(/^\/+|\/+$/g, '')
  }

  /**
   * Transforms HTML to use relative paths with proper base href
   * @param html Original HTML content
   * @param webroot Normalized webroot (no leading/trailing slashes)
   * @returns Modified HTML with correct base href and relative asset paths
   */
  private static transformHtmlForWebroot(html: string, webroot: string): string {
    const baseHref = webroot ? `/${webroot}/` : '/'

    return html
      .replace(/<base href="[^"]*"(\s*)\/?>/g, `<base href="${baseHref}"$1/>`)
      .replace(/href="\/(?:.*?\/)?assets\//g, 'href="assets/')
      .replace(/href="\/(?:.*?\/)?favicon\.ico"/g, 'href="favicon.ico"')
      .replace(/href="\/(?:.*?\/)?([^"/]+\.(png|svg|webmanifest))"/g, 'href="$1"')
      .replace(/src="\/(?:.*?\/)?assets\//g, 'src="assets/')
  }
}

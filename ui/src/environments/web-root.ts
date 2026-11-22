const RE_SLASHES_AT_END = /\/+$/

/**
 * The path the UI is served under, such as `/homebridge`, or an empty text at the root of the server.
 *
 * The server writes it into the `<base>` tag of the page (the `webRoot` setting). Every address the app builds
 * itself starts with it: the API, the live connection and plain links.
 */
export function webRootFromPage(page: Document = document): string {
  const baseHref = page.querySelector('base')?.getAttribute('href') || '/'

  return baseHref.replace(RE_SLASHES_AT_END, '')
}

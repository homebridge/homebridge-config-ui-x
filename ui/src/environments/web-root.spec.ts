import { describe, expect, it } from 'vitest'

import { webRootFromPage } from './web-root'

/** A page with the given text in its head */
function pageWith(head: string): Document {
  return new DOMParser().parseFromString(`<html><head>${head}</head><body></body></html>`, 'text/html')
}

describe('the web root of the page', () => {
  it('is empty at the root of the server', () => {
    expect(webRootFromPage(pageWith('<base href="/" />'))).toBe('')
  })

  it('is the path the server wrote into the base tag', () => {
    expect(webRootFromPage(pageWith('<base href="/homebridge/" />'))).toBe('/homebridge')
  })

  it('keeps every part of a longer path', () => {
    expect(webRootFromPage(pageWith('<base href="/home/bridge/" />'))).toBe('/home/bridge')
  })

  it('is empty on a page without a base tag', () => {
    expect(webRootFromPage(pageWith(''))).toBe('')
  })
})

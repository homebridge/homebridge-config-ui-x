import { vi } from 'vitest'

/**
 * Browser APIs that jsdom either does not implement at all, or implements by
 * throwing "Not implemented". Every one of these is reached during ordinary
 * component construction somewhere in the app, so they are installed once by
 * the global setup file rather than per spec.
 */

/** Spy for `window.location.reload` - asserted by the logout and settings specs. */
export const locationReload = vi.fn()

/** Spy for `window.location.assign`. */
export const locationAssign = vi.fn()

/** Spy for `window.location.replace`. */
export const locationReplace = vi.fn()

/** Spy for `window.open` - the server-time warning toast and support links use it. */
export const windowOpen = vi.fn()

/** Spy for `window.scrollTo` - jsdom logs "Not implemented" without it. */
export const windowScrollTo = vi.fn()

/** Spy for `Element.prototype.scrollIntoView` - used by the logs and terminal views. */
export const scrollIntoView = vi.fn()

type MediaListener = (event: MediaQueryListEvent) => void

let matchMediaMatches = false
const mediaListeners = new Set<MediaListener>()

/**
 * Set what the next `window.matchMedia(...).matches` read returns.
 *
 * Read at construction time by AppComponent (dark mode) and the login page, so
 * call this before `TestBed.createComponent`.
 * @param matches - what the media query should report
 */
export function setMatchMedia(matches: boolean): void {
  matchMediaMatches = matches
}

/**
 * Fire a change on every media query listener the app has registered, the way
 * a real browser does when the user switches their system theme.
 * @param matches - the new state to report to the listeners
 */
export function fireMatchMediaChange(matches: boolean): void {
  matchMediaMatches = matches
  const event = { matches, media: '' } as MediaQueryListEvent
  mediaListeners.forEach(listener => listener(event))
}

function createMediaQueryList(query: string): MediaQueryList {
  // Typed loosely rather than with the DOM's EventListener union: those names
  // are type-only, so eslint's no-undef rule rejects them here
  const addListener = (listener: unknown) => {
    if (typeof listener === 'function') {
      mediaListeners.add(listener as MediaListener)
    }
  }
  const removeListener = (listener: unknown) => {
    if (typeof listener === 'function') {
      mediaListeners.delete(listener as MediaListener)
    }
  }

  return {
    get matches() {
      return matchMediaMatches
    },
    media: query,
    onchange: null,
    addEventListener: vi.fn((_type: string, listener: unknown) => addListener(listener)),
    removeEventListener: vi.fn((_type: string, listener: unknown) => removeListener(listener)),
    addListener: vi.fn(addListener),
    removeListener: vi.fn(removeListener),
    dispatchEvent: vi.fn(() => true),
  } as unknown as MediaQueryList
}

function define(target: object, property: string, value: unknown): void {
  Object.defineProperty(target, property, { configurable: true, writable: true, value })
}

/**
 * A do-nothing 2D canvas context.
 *
 * jsdom has no canvas, and prints "Not implemented: HTMLCanvasElement's
 * getContext()" for every chart widget a spec so much as imports. Returning a
 * stub keeps the output readable. It draws nothing - chart behaviour is tested
 * through the widget's own maths, not by rendering.
 */
function fakeCanvasContext(): Record<string, unknown> {
  const noop = () => {}
  return {
    canvas: null,
    save: noop,
    restore: noop,
    scale: noop,
    translate: noop,
    rotate: noop,
    clearRect: noop,
    fillRect: noop,
    strokeRect: noop,
    beginPath: noop,
    closePath: noop,
    moveTo: noop,
    lineTo: noop,
    arc: noop,
    bezierCurveTo: noop,
    quadraticCurveTo: noop,
    rect: noop,
    fill: noop,
    stroke: noop,
    clip: noop,
    fillText: noop,
    strokeText: noop,
    setLineDash: noop,
    getLineDash: () => [],
    setTransform: noop,
    createLinearGradient: () => ({ addColorStop: noop }),
    measureText: (text: string) => ({ width: text.length * 6 }),
    getImageData: () => ({ data: [] }),
    putImageData: noop,
    drawImage: noop,
  }
}

let locationFields: Record<string, string> = {}

/**
 * Replace `window.location` with a plain object.
 *
 * The individual members of a jsdom Location are unforgeable - defining over
 * `location.reload` throws, and wrapping it in a Proxy trips the invariant
 * check - but `location` itself is still configurable on the window, so the
 * whole object can be swapped for one whose `reload` is a spy. Assigning to
 * `href` then just sets a property instead of trying to navigate, which is
 * what a test wants anyway.
 */
function installLocation(): void {
  const real = window.location
  locationFields = {
    href: real.href,
    origin: real.origin,
    protocol: real.protocol,
    host: real.host,
    hostname: real.hostname,
    port: real.port,
    pathname: real.pathname,
    search: real.search,
    hash: real.hash,
  }

  define(window, 'location', {
    ...locationFields,
    reload: locationReload,
    assign: locationAssign,
    replace: locationReplace,
    toString: () => locationFields.href,
  })
}

/**
 * Install every browser stub. Called once by the global setup file.
 */
export function installBrowserStubs(): void {
  define(window, 'matchMedia', vi.fn(createMediaQueryList))
  define(window, 'open', windowOpen)
  define(window, 'scrollTo', windowScrollTo)
  define(Element.prototype, 'scrollIntoView', scrollIntoView)
  define(HTMLCanvasElement.prototype, 'getContext', vi.fn(() => fakeCanvasContext()))

  installLocation()

  // Drive animation frames off the timer queue so `vi.advanceTimersByTime`
  // flushes them. Without this a fake-timer spec hangs waiting for a frame
  // that jsdom will only deliver on a real tick.
  define(window, 'requestAnimationFrame', (callback: (time: number) => void) => setTimeout(() => callback(performance.now()), 0) as unknown as number)
  define(window, 'cancelAnimationFrame', (handle: number) => clearTimeout(handle))
}

/**
 * Reset the stubs between tests. Called by the global setup file's `beforeEach`.
 */
export function resetBrowserStubs(): void {
  matchMediaMatches = false
  mediaListeners.clear()
  // A spec may have written to href or hash; put the url back
  Object.assign(window.location, locationFields)
  locationReload.mockClear()
  locationAssign.mockClear()
  locationReplace.mockClear()
  windowOpen.mockClear()
  windowScrollTo.mockClear()
  scrollIntoView.mockClear()
}

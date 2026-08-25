import { vi } from 'vitest'

/**
 * Browser APIs that jsdom either does not implement at all, or implements by
 * throwing "Not implemented". Every one of these is reached during ordinary
 * component construction somewhere in the app, so they are installed once by
 * the global setup file rather than per spec.
 */

/**
 * The spies, kept on `globalThis` rather than in module scope.
 *
 * ⚠️ This module is evaluated more than once: the global setup file loads one
 * copy and a spec importing from `@/testing` can get another, because the
 * unit-test builder compiles the app through its build target. Two copies meant
 * the setup installed one `vi.fn()` on `window.location` while the spec asserted
 * on a different one, so a genuine `reload()` looked like it never happened.
 * Anchoring them to a global makes every copy share the same spies.
 * @param key - a unique name for the spy
 */
function sharedSpy(key: string) {
  const store = ((globalThis as any).__uiTestSpies ??= {})
  return (store[key] ??= vi.fn())
}

/** Spy for `window.location.reload` - asserted by the logout and settings specs. */
export const locationReload = sharedSpy('locationReload')

/** Spy for `window.location.assign`. */
export const locationAssign = sharedSpy('locationAssign')

/** Spy for `window.location.replace`. */
export const locationReplace = sharedSpy('locationReplace')

/** Spy for `window.open` - the server-time warning toast and support links use it. */
export const windowOpen = sharedSpy('windowOpen')

/** Spy for `window.scrollTo` - jsdom logs "Not implemented" without it. */
export const windowScrollTo = sharedSpy('windowScrollTo')

/** Spy for `Element.prototype.scrollIntoView` - used by the logs and terminal views. */
export const scrollIntoView = sharedSpy('scrollIntoView')

type MediaListener = (event: MediaQueryListEvent) => void

/**
 * The mutable state, kept on `globalThis` for the same reason as the spies
 * above: the setup file installs the stubs from one copy of this module while
 * a spec calls `setMatchMedia` on another, so module-scope values simply never
 * met. Everything the stubs read or write lives in this one bag.
 */
const state = ((globalThis as any).__uiTestBrowserState ??= {
  matchMediaMatches: false,
  mediaListeners: new Set<MediaListener>(),
  locationFields: {} as Record<string, string>,
}) as { matchMediaMatches: boolean, mediaListeners: Set<MediaListener>, locationFields: Record<string, string> }

/**
 * Set what the next `window.matchMedia(...).matches` read returns.
 *
 * Read at construction time by AppComponent (dark mode) and the login page, so
 * call this before `TestBed.createComponent`.
 * @param matches - what the media query should report
 */
export function setMatchMedia(matches: boolean): void {
  state.matchMediaMatches = matches
}

/**
 * Fire a change on every media query listener the app has registered, the way
 * a real browser does when the user switches their system theme.
 * @param matches - the new state to report to the listeners
 */
export function fireMatchMediaChange(matches: boolean): void {
  state.matchMediaMatches = matches
  const event = { matches, media: '' } as MediaQueryListEvent
  state.mediaListeners.forEach(listener => listener(event))
}

function createMediaQueryList(query: string): MediaQueryList {
  // Typed loosely rather than with the DOM's EventListener union: those names
  // are type-only, so eslint's no-undef rule rejects them here
  const addListener = (listener: unknown) => {
    if (typeof listener === 'function') {
      state.mediaListeners.add(listener as MediaListener)
    }
  }
  const removeListener = (listener: unknown) => {
    if (typeof listener === 'function') {
      state.mediaListeners.delete(listener as MediaListener)
    }
  }

  return {
    get matches() {
      return state.matchMediaMatches
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
  state.locationFields = {
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
    ...state.locationFields,
    reload: locationReload,
    assign: locationAssign,
    replace: locationReplace,
    toString: () => state.locationFields.href,
  })
}

/**
 * A deterministic FileReader for image-preview tests.
 *
 * jsdom's FileReader currently passes a cross-realm byte array to its base64
 * dependency under newer Node versions, which throws after the test has
 * already completed. Browser encoding itself is not what these component
 * tests exercise, so a tiny valid data URL is the useful boundary here.
 */
class FakeFileReader {
  public result: string | null = null
  public onload: ((event: { target: FakeFileReader }) => void) | null = null

  public readAsDataURL(file: File): void {
    this.result = `data:${file.type || 'application/octet-stream'};base64,eA==`
    this.onload?.({ target: this })
  }
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
  define(window, 'FileReader', FakeFileReader)

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
  state.matchMediaMatches = false
  state.mediaListeners.clear()
  // A spec may have written to href or hash; put the url back
  Object.assign(window.location, state.locationFields)
  locationReload.mockClear()
  locationAssign.mockClear()
  locationReplace.mockClear()
  windowOpen.mockClear()
  windowScrollTo.mockClear()
  scrollIntoView.mockClear()
}

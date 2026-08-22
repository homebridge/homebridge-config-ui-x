import { beforeEach } from 'vitest'

import { setStoredToken } from '@/app/core/auth/token-store'

import { installBrowserStubs, resetBrowserStubs } from './fakes/browser.fake'

// `globalThis.backup` and `globalThis.terminal` are read in field
// initialisers by the settings, backup, restore, wallpaper and setup-wizard
// components, so without this a spec for any of them throws while the
// component is being constructed. main.ts imports the same module for the
// real app.
import '../../../src/global-defaults'

installBrowserStubs()

beforeEach(() => {
  window.localStorage.clear()
  window.sessionStorage.clear()

  // Module-level state, not a service: a token left behind by one test is
  // still there for the next one.
  //
  // ⚠️ Cleared through the hook `@/testing` publishes, not by calling the
  // import directly - this file holds a different copy of `token-store` from
  // the one the specs and the app share, so clearing its own copy did nothing.
  setStoredToken(null)
  ;((globalThis as any).__resetTokenStore as (() => void) | undefined)?.()

  // The theme, terminal and accessory pages all add classes to the body
  document.body.className = ''
  document.body.removeAttribute('style')

  resetBrowserStubs()
})

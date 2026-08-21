import { setStoredToken } from '@/app/core/auth/token-store'

/**
 * Let the global setup file clear the access token.
 *
 * ⚠️ The setup file cannot simply import `token-store` and call it: the
 * unit-test builder compiles specs through its build target, so the setup file
 * ends up holding a *different* copy of the module from the one the specs and
 * the app share. Clearing its own copy left the real token in place, so a token
 * set by one test was still there for the next one in that file.
 *
 * This module is loaded from `@/testing`, which lives in the same graph as the
 * specs, and publishes the reset on a global the setup file can reach.
 */
;

(globalThis as any).__resetTokenStore = () => setStoredToken(null)

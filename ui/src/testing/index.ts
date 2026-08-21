/**
 * Shared testing toolkit for the Angular UI.
 *
 * Import from `@/testing` in any spec:
 *
 *     import { fakeApi, makeSettings, provideTestTranslate } from '@/testing'
 *
 * The global setup file (`src/testing/setup.ts`, wired through the test
 * builder's `setupFiles`) installs the browser stubs and resets shared state
 * between tests - specs do not import it.
 *
 * `provideFakes` and `provideTestTranslate` are deliberately NOT re-exported
 * here. They reference the real service classes, which would drag the whole
 * app graph into a spec that only tests a pure function. Import them from
 * `@/testing/providers` in the specs that need DI.
 */

import './reset-token-store'

export * from './constants'
export * from './fakes/api.fake'
export * from './fakes/auth.fake'
export * from './fakes/browser.fake'
export * from './fakes/cache.fake'
export * from './fakes/modal.fake'
export * from './fakes/settings.fake'
export * from './fakes/terminal.fake'
export * from './fakes/toastr.fake'
export * from './fakes/ws.fake'
export * from './fixtures/accessory.fixture'
export * from './fixtures/plugin.fixture'
export * from './fixtures/widget.fixture'

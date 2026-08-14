import { ModuleRef } from '@nestjs/core'
import { describe, expect, it } from 'vitest'

import { WsAdminGuard } from '../../src/core/auth/guards/ws-admin-guard.js'
import { WsLogGuard } from '../../src/core/auth/guards/ws-log.guard.js'
import { WsGuard } from '../../src/core/auth/guards/ws.guard.js'

/**
 * The websocket guards must declare EVERY constructor dependency with an
 * explicit `@Inject()`.
 *
 * The dev server (`npm run watch`) runs the TypeScript through tsx, which uses
 * esbuild and does NOT emit `design:paramtypes`. A parameter that relies on
 * that emitted metadata therefore has nothing for Nest to resolve, and is
 * injected as `undefined` — so the guard threw on its first use, disconnected
 * the client, and socket.io never retries a server-initiated disconnect. The
 * visible symptom was the status page stuck on its spinner under `npm run
 * watch`, while a `tsc`-built release worked because tsc does emit the metadata.
 *
 * Reading Nest's own `self:paramtypes` metadata is deliberate: it records only
 * what `@Inject()` wrote, so this assertion holds whichever transform ran.
 */
const SELF_DECLARED_DEPS_METADATA = 'self:paramtypes'

function declaredDeps(Guard: any): Array<{ index: number, param: any }> {
  return Reflect.getMetadata(SELF_DECLARED_DEPS_METADATA, Guard) ?? []
}

describe.each([
  ['WsGuard', WsGuard],
  ['WsAdminGuard', WsAdminGuard],
  ['WsLogGuard', WsLogGuard],
])('%s', (_name, Guard: any) => {
  it('declares an explicit @Inject() for every constructor parameter', () => {
    const indices = declaredDeps(Guard).map(d => d.index).sort((a, b) => a - b)
    expect(indices).toEqual(Array.from({ length: Guard.length }, (_, i) => i))
  })

  it('injects ModuleRef explicitly rather than relying on emitted metadata', () => {
    expect(declaredDeps(Guard).some(d => d.param === ModuleRef)).toBe(true)
  })
})

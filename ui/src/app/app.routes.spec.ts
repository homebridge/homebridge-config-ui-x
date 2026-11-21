import { describe, expect, it } from 'vitest'

import { authGuard } from '@/app/core/auth/guards/auth.guard'

import { routes } from './app.routes'

describe('app routes', () => {
  it('serves the kiosk at the top level, behind the auth guard, outside the main layout', () => {
    const kiosk = routes.find(route => route.path === 'kiosk')

    expect(kiosk).toBeDefined()
    expect(kiosk!.canActivate).toEqual([authGuard])
    expect(kiosk!.children).toBeUndefined()
    expect(kiosk!.loadComponent).toBeDefined()
  })

  it('keeps the kiosk ahead of the layout route, so the layout does not wrap it', () => {
    const kioskIndex = routes.findIndex(route => route.path === 'kiosk')
    const layoutIndex = routes.findIndex(route => route.path === '')
    expect(kioskIndex).toBeGreaterThanOrEqual(0)
    expect(kioskIndex).toBeLessThan(layoutIndex)
  })
})

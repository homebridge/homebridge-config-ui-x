import { provideRouter, withInMemoryScrolling, withViewTransitions } from '@angular/router'

import { routes } from '@/app/app.routes'

/**
 * Provides routing configuration with view transitions and scroll restoration
 */
export function provideAppRouting() {
  return provideRouter(
    routes,
    withViewTransitions(),
    withInMemoryScrolling({
      scrollPositionRestoration: 'enabled',
    }),
  )
}

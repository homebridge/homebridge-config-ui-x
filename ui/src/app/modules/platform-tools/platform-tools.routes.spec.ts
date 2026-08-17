import type { Route } from '@angular/router'

import { describe, expect, it, vi } from 'vitest'

import { startupScriptResolver } from '@/app/modules/platform-tools/docker/startup-script/startup-script.resolver'
import { PLATFORM_TOOLS_ROUTES } from '@/app/modules/platform-tools/platform-tools.routes'

/**
 * The platform tools route table: the docker and linux pages, and the terminal.
 *
 * Every page is lazily loaded through a named export. TypeScript does check
 * those names — a plain rename is a build error, not a runtime one — so what is
 * left to check here is that each loader really does resolve a component (a cast
 * anywhere in the chain silences the compiler) and that the paths are the ones
 * the menu links to.
 *
 * The part that only fails at runtime is the guard:
 *
 * ⚠️ **the terminal decides for itself whether it can be left.** The guard hands
 * the question to the component, and defends against a component that has no
 * answer — without that fallback, navigating away from the terminal throws and
 * the user cannot leave the page at all.
 */
describe('the platform tools routes', () => {
  /**
   * Every route in the table, children included.
   * @param routes - the routes to walk
   */
  function flatten(routes: Route[]): Route[] {
    return routes.flatMap(route => [route, ...flatten(route.children ?? [])])
  }

  const allRoutes = flatten(PLATFORM_TOOLS_ROUTES)

  /** One route by its full path, for the assertions that name one. */
  function routeFor(path: string): Route {
    const parts = path.split('/')
    let routes = PLATFORM_TOOLS_ROUTES
    let found: Route | undefined
    for (const part of parts) {
      found = routes.find(route => route.path === part)
      expect(found, `no route for ${path}`).toBeDefined()
      routes = found!.children ?? []
    }
    return found!
  }

  describe('the pages it can load', () => {
    it.each([
      'docker/startup-script',
      'docker/restart-container',
      'linux/restart-server',
      'linux/shutdown-server',
      'terminal',
    ])('has a route for %s', (path) => {
      expect(routeFor(path).loadComponent).toBeTypeOf('function')
    })

    it.each(
      allRoutes
        .filter(route => route.loadComponent)
        .map(route => [route.path, route] as const),
    )('can actually load %s', async (_path, route) => {
      // The assertion is that the named export exists. A renamed class resolves
      // to undefined here and to a blank page with a console error in the app
      const component = await (route.loadComponent as any)()

      expect(component).toBeTypeOf('function')
      expect(component.name).not.toBe('')
    })
  })

  describe('where an empty path goes', () => {
    it.each(['', 'docker', 'linux'])('sends %s back to the dashboard', (path) => {
      // These sections have no landing page of their own
      const route = path === '' ? PLATFORM_TOOLS_ROUTES[0] : routeFor(path).children![0]

      expect(route.redirectTo).toBe('/')
      expect(route.pathMatch).toBe('full')
    })
  })

  describe('loading the startup script before the page opens', () => {
    it('resolves it through the startup script resolver', () => {
      // The editor needs the script in hand; fetching it on init would show an
      // empty editor first
      expect(routeFor('docker/startup-script').resolve).toEqual({ startupScript: startupScriptResolver })
    })
  })

  describe('leaving the terminal', () => {
    /**
     * Ask the guard whether the terminal may be left.
     * @param component - the terminal component, as the router hands it over
     * @param nextUrl - where the user is going, if the router knows
     */
    function canLeave(component: any, nextUrl?: string) {
      const guard = routeFor('terminal').canDeactivate![0] as any
      return guard(component, null, null, nextUrl === undefined ? undefined : { url: nextUrl })
    }

    it('asks the terminal, and tells it where the user is going', () => {
      // The terminal only warns for some destinations - it does not prompt when
      // the user is only moving between tabs of the same page
      const component = { canDeactivate: vi.fn().mockReturnValue(true) }

      canLeave(component, '/plugins')

      expect(component.canDeactivate).toHaveBeenCalledWith('/plugins')
    })

    it('lets the user leave when the terminal is happy', () => {
      expect(canLeave({ canDeactivate: () => true }, '/plugins')).toBe(true)
    })

    it('holds the user on the page when the terminal is not', () => {
      // A running command would otherwise be killed without a word
      expect(canLeave({ canDeactivate: () => false }, '/plugins')).toBe(false)
    })

    it('passes on whatever the terminal answers, prompt included', () => {
      // The real component returns a promise from a confirmation modal
      const answer = Promise.resolve(true)

      expect(canLeave({ canDeactivate: () => answer }, '/plugins')).toBe(answer)
    })

    it('copes with the router not knowing the next url', () => {
      const component = { canDeactivate: vi.fn().mockReturnValue(true) }

      canLeave(component, undefined)

      expect(component.canDeactivate).toHaveBeenCalledWith(undefined)
    })

    it('lets the user leave a component that cannot answer', () => {
      // The defensive branch. Calling a method that is not there would throw
      // inside the router and strand the user on the terminal page
      expect(() => canLeave({})).not.toThrow()
      expect(canLeave({})).toBe(true)
    })
  })
})

import type { FakeApi, FakeToastr } from '@/testing'
import type { ResolveFn } from '@angular/router'

import { TestBed } from '@angular/core/testing'
import { provideRouter, Router } from '@angular/router'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { configEditorResolver } from '@/app/modules/config-editor/config-editor.resolver'
import { startupScriptResolver } from '@/app/modules/platform-tools/docker/startup-script/startup-script.resolver'
import { usersResolver } from '@/app/modules/users/users.resolver'
import { fakeApi, toastrStub } from '@/testing'
import { provideFakes, provideTestTranslate } from '@/testing/providers'

/**
 * The three route resolvers: the config editor, the users page and the docker
 * startup script.
 *
 * All three exist so their page can render with its data already in hand. What
 * makes them worth a spec is the failure path, and one thing about it that is
 * easy to get wrong:
 *
 * ⚠️ **returning `undefined` from a resolver does not cancel the navigation.**
 * Angular activates the route anyway, the component mounts, and it then throws
 * on the payload that is not there — so the user gets a blank page and a console
 * error instead of a message. The resolvers therefore redirect *and* re-throw.
 * Dropping the `throw` looks harmless and is the whole bug, which is why every
 * case below asserts the promise rejects rather than resolves.
 */
describe('the route resolvers', () => {
  let api: FakeApi
  let toastr: FakeToastr
  let navigate: ReturnType<typeof vi.spyOn>

  /**
   * Run a resolver the way the router does — inside an injection context.
   * @param resolver - the resolver under test
   */
  function run<T>(resolver: ResolveFn<T>): Promise<T> {
    return TestBed.runInInjectionContext(() => resolver({} as any, {} as any)) as Promise<T>
  }

  beforeEach(() => {
    TestBed.resetTestingModule()
    api = fakeApi()
    toastr = toastrStub()

    TestBed.configureTestingModule({
      providers: [provideRouter([]), provideTestTranslate(), provideFakes({ api, toastr })],
    })

    navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true)
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.mocked(console.error).mockClear()
  })

  /**
   * The three resolvers and the endpoint each reads.
   *
   * A resolver pointed at the wrong url fails in a way that looks like a server
   * problem, so the url is pinned as well as the behaviour.
   */
  const resolvers: Array<[string, ResolveFn<any>, string]> = [
    ['the config editor', configEditorResolver, '/config-editor'],
    ['the users page', usersResolver, '/users'],
    ['the docker startup script', startupScriptResolver, '/platform-tools/docker/startup-script'],
  ]

  describe.each(resolvers)('%s', (_label, resolver, url) => {
    it('reads its data from the server once', async () => {
      api.respond('get', url, {})

      await run(resolver)

      expect(api.callsTo('get', url)).toHaveLength(1)
      expect(api.callsTo('get')).toHaveLength(1)
    })

    describe('when the server cannot be reached', () => {
      /**
       * Fail the request and run the resolver, returning what it rejected with.
       * @param error - the failure the api layer produces
       */
      async function failWith(error: any) {
        api.fail('get', url, error)
        return await run(resolver).then(
          value => ({ rejected: false as const, value }),
          reason => ({ rejected: true as const, reason }),
        )
      }

      it('rejects rather than resolving with nothing', async () => {
        // The load-bearing assertion. Resolving - with undefined or anything
        // else - lets the route activate and the page mount without its data
        const outcome = await failWith(new Error('server unavailable'))

        expect(outcome.rejected).toBe(true)
      })

      it('re-throws the original error', async () => {
        const error = new Error('server unavailable')

        const outcome = await failWith(error)

        expect(outcome.rejected && outcome.reason).toBe(error)
      })

      it('sends the user back to the status page', async () => {
        await failWith(new Error('server unavailable'))

        expect(navigate).toHaveBeenCalledWith(['/'])
      })

      it('waits for the redirect before giving up', async () => {
        // Not just "navigate was called": the resolver awaits it. Without the
        // await, the throw races the redirect - the router sees a failed
        // resolve for the route it is entering while the redirect is still in
        // flight, and which one wins is a matter of timing
        let arrive: (ok: boolean) => void = () => {}
        navigate.mockReturnValue(new Promise<boolean>((resolve) => {
          arrive = resolve
        }))
        api.fail('get', url, new Error('server unavailable'))

        let settled = false
        const resolving = run(resolver).catch(() => {
          settled = true
        })
        for (let tick = 0; tick < 5; tick += 1) {
          await Promise.resolve()
        }

        expect(settled).toBe(false)

        arrive(true)
        await resolving

        expect(settled).toBe(true)
      })

      it('tells the user what went wrong', async () => {
        await failWith(new Error('server unavailable'))

        expect(toastr.error).toHaveBeenCalledWith('toast.api_error_generic', 'toast.title_error')
      })

      it('passes on a message the server supplied', async () => {
        // These are the short, useful ones - "Config file not found" rather than
        // Angular's auto-generated http string
        await failWith({ error: { message: 'Config file is not writable' } })

        expect(toastr.error).toHaveBeenCalledWith('Config file is not writable', 'toast.title_error')
      })

      it('logs the raw error for debugging', async () => {
        // The toast is deliberately vague; the console is where the detail goes
        const error = new Error('server unavailable')

        await failWith(error)

        expect(console.error).toHaveBeenCalledWith(error)
      })

      it('does not retry the request', async () => {
        await failWith(new Error('server unavailable'))

        expect(api.callsTo('get', url)).toHaveLength(1)
      })
    })
  })

  describe('the config editor', () => {
    it('hands the editor formatted json rather than an object', async () => {
      // The editor is a text editor. It needs the config as text, and formatted -
      // a single-line dump of a large config is unreadable and unfixable by hand
      api.respond('get', '/config-editor', { bridge: { name: 'Homebridge', port: 51826 } })

      const resolved = await run(configEditorResolver)

      expect(resolved).toBe('{\n    "bridge": {\n        "name": "Homebridge",\n        "port": 51826\n    }\n}')
    })

    it('indents with four spaces, which is what the editor saves back', async () => {
      api.respond('get', '/config-editor', { platforms: [] })

      const resolved = await run(configEditorResolver) as string

      expect(resolved.split('\n')[1]).toBe('    "platforms": []')
    })

    it('round-trips a config unchanged', async () => {
      const config = { bridge: { name: 'Homebridge' }, accessories: [], platforms: [{ platform: 'config' }] }
      api.respond('get', '/config-editor', config)

      const resolved = await run(configEditorResolver) as string

      expect(JSON.parse(resolved)).toEqual(config)
    })

    it('copes with an empty config', async () => {
      api.respond('get', '/config-editor', {})

      expect(await run(configEditorResolver)).toBe('{}')
    })
  })

  describe('the users page', () => {
    it('hands over the user list as it arrived', async () => {
      // Not reshaped: the page reads `admin` and `otpActive` straight off these
      const users = [{ id: 1, username: 'admin', admin: true }]
      api.respond('get', '/users', users)

      expect(await run(usersResolver)).toEqual(users)
    })
  })

  describe('the docker startup script', () => {
    it('hands over the script as it arrived', async () => {
      // Whitespace and all - it goes straight into a code editor
      api.respond('get', '/platform-tools/docker/startup-script', { script: '#!/bin/sh\n\nexit 0\n' })

      expect(await run(startupScriptResolver)).toEqual({ script: '#!/bin/sh\n\nexit 0\n' })
    })
  })
})

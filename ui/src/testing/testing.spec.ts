import { createEnvironmentInjector, EnvironmentInjector } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { firstValueFrom } from 'rxjs'
import { describe, expect, it } from 'vitest'

import { getStoredToken, setStoredToken } from '@/app/core/auth/token-store'
import { CONFIRM_MODAL_DATA } from '@/app/core/modal-data-tokens'
import {
  fakeApi,
  fakeIoNamespace,
  fakeWs,
  locationReload,
  makeAuth,
  makePlugin,
  makeSettings,
  makeWidget,
  modalServiceSpy,
  toastrStub,
} from '@/testing'

describe('testing toolkit', () => {
  describe('global setup', () => {
    it('provides the browser APIs jsdom is missing', () => {
      expect(typeof window.matchMedia).toBe('function')
      expect(typeof Element.prototype.scrollIntoView).toBe('function')
      expect(globalThis.backup.maxBackupSize).toBeGreaterThan(0)
      expect(globalThis.terminal.bufferSize).toBeGreaterThan(0)
    })

    it('replaces location.reload, which jsdom refuses to run', () => {
      window.location.reload()

      expect(locationReload).toHaveBeenCalledOnce()
    })

    it('starts a test with no stored token', () => {
      expect(getStoredToken()).toBeNull()
      setStoredToken('leaked-token')
    })

    it('clears a token the previous test left behind', () => {
      expect(getStoredToken()).toBeNull()
    })
  })

  describe('fakeApi', () => {
    it('resolves a registered response and records the call', async () => {
      const api = fakeApi().respond('get', '/plugins', [makePlugin()])

      await expect(api.get('/plugins')).resolves.toHaveLength(1)
      expect(api.lastCall('get', '/plugins')?.url).toBe('/plugins')
    })

    it('records the options object, which is where delete payloads live', async () => {
      const api = fakeApi()

      await api.delete('/users/1', { body: { confirm: true } })

      expect(api.lastCall('delete')?.options).toEqual({ body: { confirm: true } })
    })

    it('rejects with the registered error', async () => {
      const api = fakeApi().fail('post', '/auth/login', { status: 401 })

      await expect(api.post('/auth/login', {})).rejects.toEqual({ status: 401 })
    })

    it('resolves undefined for an unregistered call, unless strict', async () => {
      await expect(fakeApi().get('/anything')).resolves.toBeUndefined()
      await expect(fakeApi({ strict: true }).get('/anything')).rejects.toThrow('no response registered')
    })
  })

  describe('fakeWs', () => {
    it('returns the identical namespace on a second connect', () => {
      const ws = fakeWs()

      expect(ws.connectToNamespace('status')).toBe(ws.connectToNamespace('status'))
      expect(ws.getExistingNamespace('status')).toBe(ws.connectToNamespace('status'))
    })

    it('has no existing namespace until one is opened', () => {
      expect(fakeWs().getExistingNamespace('status')).toBeUndefined()
    })

    it('replays the connected event to a late subscriber', async () => {
      const io = fakeIoNamespace({ connected: false })
      io.markConnected()

      await expect(firstValueFrom(io.connected)).resolves.toBeUndefined()
    })

    it('delivers server events to the registered handlers', () => {
      const io = fakeIoNamespace()
      const seen: string[] = []
      const handler = (line: string) => seen.push(line)

      io.socket.on('stdout', handler)
      io.socket.fire('stdout', 'hello')
      io.socket.off('stdout', handler)
      io.socket.fire('stdout', 'ignored')

      expect(seen).toEqual(['hello'])
      expect(io.socket.handlers('stdout')).toHaveLength(0)
    })

    it('maps an error acknowledgement to a failed request', async () => {
      const io = fakeIoNamespace()
      io.socket.respondTo('do-thing', { error: 'nope' })

      await expect(firstValueFrom(io.request('do-thing', { id: 1 }))).rejects.toEqual({ error: 'nope' })
      expect(io.requests).toEqual([{ resource: 'do-thing', payload: { id: 1 } }])
    })

    it('tolerates a null acknowledgement', async () => {
      const io = fakeIoNamespace()
      io.socket.respondTo('do-thing', null)

      await expect(firstValueFrom(io.request('do-thing'))).resolves.toBeNull()
    })
  })

  describe('makeSettings', () => {
    it('is loaded, so a late guard subscriber still fires', async () => {
      const settings = makeSettings()

      expect(settings.settingsLoaded).toBe(true)
      await expect(firstValueFrom(settings.onSettingsLoaded)).resolves.toBeUndefined()
    })

    it('merges env overrides over the defaults', () => {
      const settings = makeSettings({ env: { runningInDocker: true } })

      expect(settings.env.runningInDocker).toBe(true)
      expect(settings.env.enableAccessories).toBe(true)
    })

    it('reads feature flags back through isFeatureEnabled', () => {
      const settings = makeSettings({ env: { featureFlags: { matter: true } } })

      expect(settings.isFeatureEnabled('matter')).toBe(true)
      expect(settings.isFeatureEnabled('missing')).toBe(false)
    })

    it('writes dotted env paths back where components read them', () => {
      const settings = makeSettings()

      settings.setEnvItem('terminal.fontSize', 16)

      expect(settings.env.terminal?.fontSize).toBe(16)
    })
  })

  describe('makeAuth', () => {
    it('has an already-resolved tokenReady, so guards do not hang', async () => {
      await expect(makeAuth().tokenReady).resolves.toBeUndefined()
    })

    it('agrees with makeSettings on the instance id', () => {
      expect(makeAuth().user.instanceId).toBe(makeSettings().env.instanceId)
    })

    it('stays mutable, the way the auth helper expects', () => {
      const auth = makeAuth()

      auth.token = null

      expect(auth.isLoggedIn()).toBe(false)
    })
  })

  describe('modalServiceSpy', () => {
    it('reads the data a modal was opened with out of its injector', () => {
      TestBed.configureTestingModule({})
      const parent = TestBed.inject(EnvironmentInjector)
      const modal = modalServiceSpy()

      modal.open(class {}, {
        injector: createEnvironmentInjector([{
          provide: CONFIRM_MODAL_DATA,
          useValue: { title: 'Remove', message: 'Are you sure?' },
        }], parent),
      })

      expect(modal.dataFor(CONFIRM_MODAL_DATA)?.title).toBe('Remove')
    })

    it('resolves the modal result on close and rejects it on dismiss', async () => {
      const modal = modalServiceSpy()

      const closed = modal.open(class {})
      closed.close('done')
      const dismissed = modal.open(class {})
      dismissed.dismiss('cancelled')

      await expect(closed.result).resolves.toBe('done')
      await expect(dismissed.result).rejects.toBe('cancelled')
    })
  })

  describe('toastrStub', () => {
    it('records what was raised and hands back a firable toast', () => {
      const toastr = toastrStub()
      let tapped = false

      const toast = toastr.error('Something broke', 'toast.title_error')
      toast.onTap.subscribe(() => {
        tapped = true
      })
      toast.onTap.next(undefined)

      expect(toastr.at('error')).toHaveLength(1)
      expect(toastr.last()?.title).toBe('toast.title_error')
      expect(tapped).toBe(true)
    })
  })

  describe('fixtures', () => {
    it('returns a fresh object each call, so a mutating component cannot leak', () => {
      const first = makePlugin()
      first.displayName = 'Rewritten by the plugin card'

      expect(makePlugin().displayName).toBe('Test Plugin')
    })

    it('gives each widget its own event subjects', () => {
      expect(makeWidget().$resizeEvent).not.toBe(makeWidget().$resizeEvent)
    })
  })
})

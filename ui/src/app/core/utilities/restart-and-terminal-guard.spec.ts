import type { ChildBridge } from '@/app/core/plugins/manage-plugins.interfaces'
import type { FakeApi, FakeModalService, FakeSettings, FakeToastr } from '@/testing'

import { TestBed } from '@angular/core/testing'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { TtlCacheService } from '@/app/core/caching/ttl-cache.service'
import { ConfirmComponent } from '@/app/core/components/confirm/confirm.component'
import { RestartChildBridgesComponent } from '@/app/core/components/restart-child-bridges/restart-child-bridges.component'
import { RestartHomebridgeComponent } from '@/app/core/components/restart-homebridge/restart-homebridge.component'
import { CONFIRM_MODAL_DATA, RESTART_CHILD_BRIDGES_MODAL_DATA } from '@/app/core/modal-data-tokens'
import { ChildBridgesService } from '@/app/core/utilities/child-bridges.service'
import { TerminalNavigationGuardService } from '@/app/core/utilities/terminal-navigation-guard.service'
import { TerminalService } from '@/app/core/utilities/terminal.service'
import { fakeApi, makeSettings, modalServiceSpy, toastrStub, ttlCacheStub } from '@/testing'
import { provideFakes, provideTestTranslate } from '@/testing/providers'

/**
 * Two small services that decide what happens when something has to restart, or
 * when the user tries to walk away from a terminal.
 */
describe('deciding what to restart', () => {
  let api: FakeApi
  let modal: FakeModalService
  let toastr: FakeToastr
  let service: ChildBridgesService

  /**
   * A child bridge as the status endpoint reports it.
   * @param overrides - fields to change
   */
  function bridge(overrides: Partial<ChildBridge> = {}): ChildBridge {
    return {
      name: 'Example Bridge',
      username: '0E:11:22:33:44:55',
      plugin: 'homebridge-example',
      ...overrides,
    } as ChildBridge
  }

  beforeEach(() => {
    TestBed.resetTestingModule()
    api = fakeApi()
    modal = modalServiceSpy()
    toastr = toastrStub()

    TestBed.configureTestingModule({
      providers: [
        provideTestTranslate(),
        provideFakes({ api, modal, toastr }),
        { provide: TtlCacheService, useValue: ttlCacheStub() },
      ],
    })

    service = TestBed.inject(ChildBridgesService)
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.mocked(console.error).mockClear()
  })

  describe('which restart to offer', () => {
    it('restarts only the affected child bridges when there are some', async () => {
      // ⚠️ The whole point: restarting all of Homebridge for a change that only
      // touched one bridge drops every other accessory off the network for a
      // minute or two
      service.openCorrectRestartModalWithBridges([bridge()])

      expect(modal.lastOpened()!.content).toBe(RestartChildBridgesComponent)
      expect(modal.dataFor(RESTART_CHILD_BRIDGES_MODAL_DATA)?.bridges).toEqual([
        { name: 'Example Bridge', username: '0E:11:22:33:44:55', matterSerialNumber: undefined },
      ])
    })

    it('carries the matter serial number through, so a matter bridge can be found', () => {
      service.openCorrectRestartModalWithBridges([bridge({ matterSerialNumber: 'MTR-123' } as any)])

      expect(modal.dataFor(RESTART_CHILD_BRIDGES_MODAL_DATA)?.bridges[0].matterSerialNumber).toBe('MTR-123')
    })

    it('restarts the whole of homebridge when no bridge is named', () => {
      service.openCorrectRestartModalWithBridges([])

      expect(modal.lastOpened()!.content).toBe(RestartHomebridgeComponent)
    })

    it('restarts the whole of homebridge when the caller knows nothing', () => {
      // ⚠️ Called with nothing at all when the endpoint that reports the affected
      // bridges failed. Falling through to the full restart is deliberate: the
      // alternative was throwing, which lost the restart notice altogether and
      // left the user with unapplied config and no prompt
      service.openCorrectRestartModalWithBridges()

      expect(modal.lastOpened()!.content).toBe(RestartHomebridgeComponent)
    })

    it('cannot be clicked away from either prompt', () => {
      // Homebridge is mid-restart
      service.openCorrectRestartModalWithBridges([])

      expect(modal.lastOpened()!.options).toMatchObject({ size: 'lg', backdrop: 'static', keyboard: false })
    })
  })

  describe('looking up the bridges of one plugin', () => {
    it('offers a child bridge restart for a plugin that has one', async () => {
      api.respond('get', '/status/homebridge/child-bridges', [bridge()])

      await service.openCorrectRestartModalForPlugin('homebridge-example')

      expect(modal.lastOpened()!.content).toBe(RestartChildBridgesComponent)
    })

    it('ignores the bridges of other plugins', async () => {
      api.respond('get', '/status/homebridge/child-bridges', [bridge({ plugin: 'homebridge-other' })])

      await service.openCorrectRestartModalForPlugin('homebridge-example')

      expect(modal.lastOpened()!.content).toBe(RestartHomebridgeComponent)
    })

    it('falls back to a full restart when the list cannot be read', async () => {
      // A restart prompt the user can act on beats no prompt at all
      api.fail('get', '/status/homebridge/child-bridges', new Error('server unavailable'))

      await service.openCorrectRestartModalForPlugin('homebridge-example')

      expect(modal.lastOpened()!.content).toBe(RestartHomebridgeComponent)
      expect(toastr.error).toHaveBeenCalled()
      expect(console.error).toHaveBeenCalled()
    })

    it('reads the list through the cache', async () => {
      api.respond('get', '/status/homebridge/child-bridges', [bridge()])

      await service.getAll()

      expect(api.callsTo('get', '/status/homebridge/child-bridges')).toHaveLength(1)
    })

    it('can be told to forget what it cached', () => {
      const cache = TestBed.inject(TtlCacheService)

      service.invalidate()

      expect(cache.invalidate).toHaveBeenCalledWith('status-child-bridges')
    })
  })
})

/**
 * Leaving the terminal page.
 *
 * ⚠️ **All four conditions have to hold before the user is stopped.** Prompting
 * when the session survives navigation anyway (persistence on), or when the user
 * has not typed a thing, is a dialog in the way of nothing — and it appears on
 * every click of the menu.
 */
describe('leaving the terminal', () => {
  let modal: FakeModalService
  let settings: FakeSettings
  let terminal: { hasActiveSession: ReturnType<typeof vi.fn>, hasUserTypedInSession: ReturnType<typeof vi.fn> }
  let guard: TerminalNavigationGuardService

  /**
   * Build the guard.
   * @param options - the state to test
   * @param options.persistence - whether the session survives navigation
   * @param options.hideWarning - whether the user turned the warning off
   * @param options.active - whether a session is open
   * @param options.typed - whether the user has typed in it
   */
  function create(options: { persistence?: boolean, hideWarning?: boolean, active?: boolean, typed?: boolean } = {}) {
    TestBed.resetTestingModule()
    modal = modalServiceSpy()
    settings = makeSettings({
      env: { terminal: { persistence: options.persistence ?? false, hideWarning: options.hideWarning ?? false } },
    })
    terminal = {
      hasActiveSession: vi.fn(() => options.active ?? true),
      hasUserTypedInSession: vi.fn(() => options.typed ?? true),
    }

    TestBed.configureTestingModule({
      providers: [
        provideTestTranslate(),
        provideFakes({ modal, settings }),
        { provide: TerminalService, useValue: terminal },
      ],
    })

    guard = TestBed.inject(TerminalNavigationGuardService)
    return guard
  }

  describe('navigating away inside the app', () => {
    it('asks first when a session is open and has been used', async () => {
      const pending = create().canDeactivate()
      await Promise.resolve()

      expect(modal.lastOpened()!.content).toBe(ConfirmComponent)
      expect(modal.dataFor(CONFIRM_MODAL_DATA)).toMatchObject({ confirmButtonClass: 'btn-primary' })

      modal.lastOpened()!.ref.close()
      expect(await pending).toBe(true)
    })

    it('keeps the user on the page when they change their mind', async () => {
      const pending = create().canDeactivate()
      await Promise.resolve()
      modal.lastOpened()!.ref.dismiss()

      expect(await pending).toBe(false)
    })

    it('says nothing when the session survives navigation anyway', async () => {
      expect(await create({ persistence: true }).canDeactivate()).toBe(true)
      expect(modal.opened).toEqual([])
    })

    it('says nothing when the user turned the warning off', async () => {
      expect(await create({ hideWarning: true }).canDeactivate()).toBe(true)
      expect(modal.opened).toEqual([])
    })

    it('says nothing when there is no session open', async () => {
      expect(await create({ active: false }).canDeactivate()).toBe(true)
      expect(modal.opened).toEqual([])
    })

    it('says nothing when the user never typed anything', async () => {
      // Opening the terminal page and walking away should not need a dialog
      expect(await create({ typed: false }).canDeactivate()).toBe(true)
      expect(modal.opened).toEqual([])
    })
  })

  describe('closing the browser tab', () => {
    /** A beforeunload event, as the browser raises it. */
    function unloadEvent() {
      return { preventDefault: vi.fn(), returnValue: undefined } as unknown as BeforeUnloadEvent
    }

    it('warns when a used session would be lost', () => {
      const event = unloadEvent()

      const message = create().handleBeforeUnload(event)

      expect(message).toBe('platform.terminal.terminate_unload')
      expect(event.preventDefault).toHaveBeenCalled()
      expect(event.returnValue).toBe('platform.terminal.terminate_unload')
    })

    it.each([
      ['the session survives anyway', { persistence: true }],
      ['the user turned the warning off', { hideWarning: true }],
      ['there is no session', { active: false }],
      ['nothing was typed', { typed: false }],
    ])('lets the tab close when %s', (_label, options) => {
      const event = unloadEvent()

      expect(create(options).handleBeforeUnload(event)).toBeUndefined()
      expect(event.preventDefault).not.toHaveBeenCalled()
    })
  })
})

import type { ComponentFixture } from '@angular/core/testing'

import { TestBed } from '@angular/core/testing'
import { ActivatedRoute, provideRouter, Router } from '@angular/router'
import { NgbModal } from '@ng-bootstrap/ng-bootstrap/modal'
import { ToastrService } from 'ngx-toastr'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { AccessoriesService } from '@/app/core/accessories/accessories.service'
import { AuthHelperService } from '@/app/core/auth/auth-helper.service'
import { AuthService } from '@/app/core/auth/auth.service'
import { WsService } from '@/app/core/communication/ws.service'
import { SettingsService } from '@/app/core/ui/settings.service'
import { provideTestTranslate } from '@/testing/providers'

import { KIOSK_SETTINGS_KEY } from './kiosk-settings'
import { KioskComponent } from './kiosk.component'

type Handler = (...args: any[]) => void

/** A socket that records its listeners so a test can fire the events itself */
function fakeSocket() {
  const handlers = new Map<string, Handler[]>()
  return {
    connected: true,
    on: vi.fn((event: string, handler: Handler) => {
      handlers.set(event, [
        ...(handlers.get(event) ?? []),
        handler,
      ])
    }),
    off: vi.fn((event: string, handler: Handler) => {
      handlers.set(event, (handlers.get(event) ?? []).filter(entry => entry !== handler))
    }),
    fire(event: string) {
      ;(handlers.get(event) ?? []).forEach(handler => handler())
    },
  }
}

describe('kioskComponent', () => {
  let fixture: ComponentFixture<KioskComponent>
  let socket: ReturnType<typeof fakeSocket>
  let setValue: ReturnType<typeof vi.fn>
  let accessories: any
  let modal: { open: ReturnType<typeof vi.fn> }
  let settings: { lightingMode: string, setLightingMode: ReturnType<typeof vi.fn> }
  let authHelper: { isAuthenticated: ReturnType<typeof vi.fn> }
  let auth: { checkAndRefreshIfNeeded: ReturnType<typeof vi.fn> }
  let toastr: { success: ReturnType<typeof vi.fn>, error: ReturnType<typeof vi.fn> }

  function services() {
    return {
      lamp: {
        uniqueId: 'lamp',
        serviceName: 'Desk lamp',
        type: 'Lightbulb',
        values: { On: false },
        getCharacteristic: vi.fn(() => ({ setValue })),
      },
      ceiling: {
        uniqueId: 'ceiling',
        serviceName: 'Ceiling light',
        type: 'Lightbulb',
        values: { On: true },
        getCharacteristic: vi.fn(() => ({ setValue })),
      },
      lock: {
        uniqueId: 'lock',
        serviceName: 'Front door',
        type: 'LockMechanism',
        values: { LockCurrentState: 1, LockTargetState: 1 },
        getCharacteristic: vi.fn(() => ({ setValue })),
      },
    }
  }

  function setup(query: Record<string, string | string[]> = {}) {
    const list = services()
    const rooms = [
      {
        name: 'Kitchen',
        services: [list.lamp, list.ceiling, list.lock],
      },
    ]
    accessories = {
      rooms: () => rooms,
      hapReadyForControl: true,
      matterReadyForControl: true,
      start: vi.fn(async () => {}),
      stop: vi.fn(),
      showAccessoryInformation: vi.fn(async () => true),
      filterContext: vi.fn(() => ({
        labels: new Map(),
        floors: [],
      })),
    }

    TestBed.configureTestingModule({
      imports: [KioskComponent],
      providers: [
        provideTestTranslate(),
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              queryParams: query,
            },
          },
        },
        { provide: AccessoriesService, useValue: accessories },
        {
          provide: WsService,
          useValue: {
            getExistingNamespace: vi.fn(() => ({ socket })),
          },
        },
        { provide: AuthService, useValue: auth },
        { provide: AuthHelperService, useValue: authHelper },
        { provide: SettingsService, useValue: settings },
        { provide: NgbModal, useValue: modal },
        { provide: ToastrService, useValue: toastr },
      ],
    })

    fixture = TestBed.createComponent(KioskComponent)
    fixture.detectChanges()
    return fixture
  }

  /** Let the start-up promise settle, then draw again */
  async function settle() {
    await fixture.whenStable()
    fixture.detectChanges()
  }

  function text(): string {
    return fixture.nativeElement.textContent as string
  }

  function tileFor(name: string): HTMLElement {
    return [
      ...fixture.nativeElement.querySelectorAll('.kiosk-tile'),
    ]
      .find((tile: any) => tile.textContent.includes(name)) as HTMLElement
  }

  beforeEach(() => {
    localStorage.clear()
    socket = fakeSocket()
    setValue = vi.fn(async () => {})
    modal = {
      open: vi.fn(() => ({
        result: Promise.resolve('confirm'),
      })),
    }
    settings = {
      lightingMode: 'auto',
      setLightingMode: vi.fn(),
    }
    authHelper = {
      isAuthenticated: vi.fn(async () => true),
    }
    auth = {
      checkAndRefreshIfNeeded: vi.fn(async () => {}),
    }
    toastr = {
      success: vi.fn(),
      error: vi.fn(),
    }
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    localStorage.clear()
    sessionStorage.clear()
    delete (navigator as any).wakeLock
  })

  describe('rendering', () => {
    it('renders the scope services grouped by room, leaving out the ones outside it', async () => {
      setup({ category: 'lights' })
      await settle()

      expect(accessories.start).toHaveBeenCalled()
      expect(text()).toContain('Kitchen')
      expect(text()).toContain('Desk lamp')
      expect(text()).toContain('Ceiling light')
      expect(text()).not.toContain('Front door')
    })

    it('shows the scope name and a clock that is not announced', async () => {
      setup({ room: 'Kitchen', category: 'lights' })
      await settle()

      expect(fixture.nativeElement.querySelector('.kiosk-view-name').textContent).toContain('Kitchen')
      expect(fixture.nativeElement.querySelector('time.kiosk-clock').getAttribute('aria-live')).toBe('off')
    })

    it('shows every accessory, under the all-accessories name, when the link names no scope', async () => {
      setup()
      await settle()

      expect(fixture.nativeElement.querySelector('.kiosk-view-name').textContent).toContain('kiosk.scope_all')
      expect(text()).toContain('Desk lamp')
      expect(text()).toContain('Front door')
    })

    it('reads repeated scope params, so a room name may contain a comma', async () => {
      setup({
        room: ['Hall', 'Kitchen, Upper'],
      })
      await settle()

      expect(fixture.nativeElement.querySelector('.kiosk-view-name').textContent).toContain('Hall · Kitchen, Upper')
    })

    it('opens the details modal from the body of a tile', async () => {
      setup()
      await settle()

      ;(tileFor('Desk lamp').querySelector('.kiosk-tile-body') as HTMLButtonElement).click()
      expect(accessories.showAccessoryInformation).toHaveBeenCalledWith(expect.objectContaining({ uniqueId: 'lamp' }))
    })

    it('toggles a light from its icon without asking', async () => {
      setup()
      await settle()

      ;(tileFor('Desk lamp').querySelector('.kiosk-tile-icon') as HTMLButtonElement).click()
      await vi.waitFor(() => expect(setValue).toHaveBeenCalledWith(true))
      expect(modal.open).not.toHaveBeenCalled()
    })
  })

  describe('sensitive devices', () => {
    it('shows a lock read only, with its icon and body disabled, by default', async () => {
      setup()
      await settle()

      const tile = tileFor('Front door')
      expect(tile.querySelector('.kiosk-lock-badge')).not.toBeNull()
      expect((tile.querySelector('.kiosk-tile-icon') as HTMLButtonElement).disabled).toBe(true)
      expect((tile.querySelector('.kiosk-tile-body') as HTMLButtonElement).disabled).toBe(true)

      ;(tile.querySelector('.kiosk-tile-icon') as HTMLButtonElement).click()
      await settle()
      expect(modal.open).not.toHaveBeenCalled()
      expect(setValue).not.toHaveBeenCalled()
    })

    it('asks to confirm each change once the tablet allows sensitive devices, and changes on confirm', async () => {
      localStorage.setItem(KIOSK_SETTINGS_KEY, JSON.stringify({
        '': { allowSensitive: true },
      }))
      setup()
      await settle()

      const icon = tileFor('Front door').querySelector('.kiosk-tile-icon') as HTMLButtonElement
      expect(icon.disabled).toBe(false)
      icon.click()

      expect(modal.open).toHaveBeenCalledTimes(1)
      await vi.waitFor(() => expect(setValue).toHaveBeenCalledWith(0))
    })

    it('does not change a sensitive device when the confirm is cancelled', async () => {
      localStorage.setItem(KIOSK_SETTINGS_KEY, JSON.stringify({
        '': { allowSensitive: true },
      }))
      modal.open.mockImplementation(() => ({
        result: Promise.reject(new Error('dismiss')),
      }))
      setup()
      await settle()

      ;(tileFor('Front door').querySelector('.kiosk-tile-icon') as HTMLButtonElement).click()
      await settle()
      expect(modal.open).toHaveBeenCalledTimes(1)
      expect(setValue).not.toHaveBeenCalled()
    })
  })

  describe('exit and settings', () => {
    it('opens the panel after a long press, and goes back to Accessories on exit', async () => {
      vi.useFakeTimers()
      setup()
      await settle()

      const component = fixture.componentInstance as any
      component.pressStart()
      vi.advanceTimersByTime(1499)
      fixture.detectChanges()
      expect(fixture.nativeElement.querySelector('.kiosk-panel')).toBeNull()

      vi.advanceTimersByTime(1)
      fixture.detectChanges()
      expect(fixture.nativeElement.querySelector('.kiosk-panel')).not.toBeNull()

      const router = TestBed.inject(Router)
      const navigate = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true)
      ;(fixture.nativeElement.querySelector('.kiosk-panel .btn-danger') as HTMLButtonElement).click()
      expect(navigate).toHaveBeenCalledWith('/accessories')
    })

    it('does not open the panel when the top bar is only tapped', async () => {
      vi.useFakeTimers()
      setup()
      await settle()

      const component = fixture.componentInstance as any
      component.pressStart()
      vi.advanceTimersByTime(300)
      component.pressCancel()
      vi.advanceTimersByTime(2000)
      fixture.detectChanges()
      expect(fixture.nativeElement.querySelector('.kiosk-panel')).toBeNull()
    })

    it('requires the exit PIN before the panel, and only opens it with the right PIN', async () => {
      vi.useFakeTimers()
      localStorage.setItem(KIOSK_SETTINGS_KEY, JSON.stringify({
        '': { pin: '1234' },
      }))
      setup()
      await settle()

      const component = fixture.componentInstance as any
      component.pressStart()
      vi.advanceTimersByTime(1500)
      fixture.detectChanges()

      expect(fixture.nativeElement.querySelector('.kiosk-panel .btn-danger')).toBeNull()
      expect(fixture.nativeElement.querySelector('#kiosk-pin-entry')).not.toBeNull()

      component.pinEntry.set('0000')
      component.unlock()
      fixture.detectChanges()
      expect(text()).toContain('kiosk.panel.pin_wrong')
      expect(fixture.nativeElement.querySelector('.kiosk-panel .btn-danger')).toBeNull()

      component.pinEntry.set('1234')
      component.unlock()
      fixture.detectChanges()
      expect(fixture.nativeElement.querySelector('.kiosk-panel .btn-danger')).not.toBeNull()
    })

    it('stores settings per scope in local storage, and keeps working when storage throws', async () => {
      setup({ category: 'lights' })
      await settle()

      const component = fixture.componentInstance as any
      component.setTheme('light')
      expect(JSON.parse(localStorage.getItem(KIOSK_SETTINGS_KEY)!)).toEqual({
        'category=lights': { allowSensitive: false, theme: 'light' },
      })
      expect(settings.setLightingMode).toHaveBeenLastCalledWith('light', 'user')
    })

    it('still works, with the defaults, when storage is unavailable', async () => {
      vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
        throw new Error('blocked')
      })
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new Error('blocked')
      })
      setup()
      await settle()

      expect(text()).toContain('Desk lamp')
      const component = fixture.componentInstance as any
      expect(() => component.setTheme('light')).not.toThrow()
      expect(component.settings().theme).toBe('light')
    })

    it('applies the dark theme while open, and restores the previous theme on exit', async () => {
      settings.lightingMode = 'light'
      setup()
      await settle()

      expect(settings.setLightingMode).toHaveBeenCalledWith('dark', 'user')
      fixture.destroy()
      expect(settings.setLightingMode).toHaveBeenLastCalledWith('light', 'user')
      expect(accessories.stop).toHaveBeenCalled()
    })
  })

  describe('screen wake lock', () => {
    it('does nothing when the Screen Wake Lock API is not available', async () => {
      expect((navigator as any).wakeLock).toBeUndefined()
      expect(() => setup()).not.toThrow()
      await settle()
      expect(text()).toContain('Desk lamp')
    })

    it('requests the screen lock, and asks again when the tab becomes visible', async () => {
      const sentinel = {
        released: false,
        release: vi.fn(async () => {}),
      }
      const request = vi.fn(async () => sentinel)
      Object.defineProperty(navigator, 'wakeLock', {
        configurable: true,
        value: { request },
      })
      let visibility = 'visible'
      vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visibility as Document['visibilityState'])

      setup()
      await settle()
      expect(request).toHaveBeenCalledWith('screen')

      sentinel.released = true
      visibility = 'visible'
      document.dispatchEvent(new Event('visibilitychange'))
      await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(2))

      fixture.destroy()
      expect(sentinel.release).toHaveBeenCalled()
    })
  })

  describe('connection', () => {
    it('shows a reconnecting banner while the socket is down, and hides it on reconnect', async () => {
      setup()
      await settle()
      expect(fixture.nativeElement.querySelector('.kiosk-banner')).toBeNull()

      socket.fire('disconnect')
      fixture.detectChanges()
      expect(fixture.nativeElement.querySelector('.kiosk-banner').textContent).toContain('kiosk.reconnecting')

      socket.fire('connect')
      fixture.detectChanges()
      expect(fixture.nativeElement.querySelector('.kiosk-banner')).toBeNull()
    })

    it('sends an expired session to login, with a return to this kiosk', async () => {
      setup({ room: 'Kitchen' })
      const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true)
      await settle()

      authHelper.isAuthenticated.mockResolvedValue(false)
      socket.fire('connect_error')
      await vi.waitFor(() => expect(navigate).toHaveBeenCalledWith('/login'))
      expect(sessionStorage.getItem('target_route')).toBe('/kiosk?room=Kitchen')
    })

    it('keeps the session when the socket drops but the token is still good', async () => {
      setup()
      const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true)
      await settle()

      socket.fire('disconnect')
      await settle()
      expect(navigate).not.toHaveBeenCalled()
    })
  })
})

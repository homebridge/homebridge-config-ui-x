import type { ComponentFixture } from '@angular/core/testing'

import { provideHttpClient } from '@angular/common/http'
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing'
import { TestBed } from '@angular/core/testing'
import { ActivatedRoute, convertToParamMap, provideRouter, Router } from '@angular/router'
import { NgbModal } from '@ng-bootstrap/ng-bootstrap/modal'
import { ToastrService } from 'ngx-toastr'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { AccessoriesService } from '@/app/core/accessories/accessories.service'
import { hap } from '@/app/core/accessories/filters/accessory-filter.fixture'
import { AuthHelperService } from '@/app/core/auth/auth-helper.service'
import { AuthService } from '@/app/core/auth/auth.service'
import { SOCKET_FACTORY } from '@/app/core/communication/socket.factory'
import { WsService } from '@/app/core/communication/ws.service'
import { SettingsService } from '@/app/core/ui/settings.service'
import { provideTestTranslate } from '@/testing/providers'

import { clearStoredDevice, KIOSK_DEVICE_STORAGE_KEY, loadStoredDevice, saveStoredDevice } from './kiosk-device.service'
import { KioskComponent } from './kiosk.component'

type Handler = (...args: any[]) => void

/** Let the component's async start-up run to the end */
const tick = () => new Promise(resolve => setTimeout(resolve))

/** A socket that keeps its listeners so a test can fire server events itself */
function fakeSocket() {
  const handlers = new Map<string, Handler[]>()
  return {
    connected: false,
    on: vi.fn((event: string, handler: Handler) => {
      handlers.set(event, [
        ...(handlers.get(event) ?? []),
        handler,
      ])
    }),
    off: vi.fn(),
    emit: vi.fn(),
    disconnect: vi.fn(),
    fire(event: string, ...args: any[]) {
      for (const handler of handlers.get(event) ?? []) {
        handler(...args)
      }
    },
  }
}

const SESSION = {
  device: {
    id: 'dev-1',
    name: 'Hall',
    viewName: 'Lights',
    allowSensitive: false,
  },
  rooms: [
    {
      name: 'Kitchen',
      services: [
        { uniqueId: 'a', customName: 'Ceiling' },
      ],
    },
  ],
}

describe('kiosk device mode', () => {
  let fixture: ComponentFixture<KioskComponent>
  let http: HttpTestingController
  let socket: ReturnType<typeof fakeSocket>
  let toastr: { error: ReturnType<typeof vi.fn>, success: ReturnType<typeof vi.fn> }
  let router: Router

  function setup(token?: string) {
    localStorage.clear()
    if (token) {
      saveStoredDevice({ token, deviceId: 'dev-1' })
    }
    TestBed.configureTestingModule({
      imports: [KioskComponent],
      providers: [
        provideTestTranslate(),
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              paramMap: convertToParamMap({}),
              data: { kioskDevice: true },
            },
          },
        },
        {
          provide: SOCKET_FACTORY,
          useValue: () => socket,
        },
        {
          provide: AccessoriesService,
          useValue: {
            rooms: () => [],
            views: () => [],
            activeViewId: Object.assign(() => null, {
              set: vi.fn(),
            }),
            start: vi.fn(async () => {}),
            stop: vi.fn(),
            filterContext: () => ({}),
          },
        },
        {
          provide: WsService,
          useValue: {
            getExistingNamespace: vi.fn(),
          },
        },
        {
          provide: AuthService,
          useValue: {
            user: {},
            checkAndRefreshIfNeeded: vi.fn(async () => {}),
          },
        },
        {
          provide: AuthHelperService,
          useValue: {
            isAuthenticated: vi.fn(async () => true),
          },
        },
        {
          provide: SettingsService,
          useValue: {
            lightingMode: 'auto',
            setLightingMode: vi.fn(),
          },
        },
        {
          provide: NgbModal,
          useValue: {
            open: vi.fn(),
          },
        },
        { provide: ToastrService, useValue: toastr },
      ],
    })
    fixture = TestBed.createComponent(KioskComponent)
    http = TestBed.inject(HttpTestingController)
    router = TestBed.inject(Router)
    vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true)
    fixture.detectChanges()
    return fixture
  }

  function text(): string {
    return fixture.nativeElement.textContent as string
  }

  beforeEach(() => {
    socket = fakeSocket()
    toastr = {
      error: vi.fn(),
      success: vi.fn(),
    }
  })

  afterEach(() => {
    http?.verify()
    vi.restoreAllMocks()
    localStorage.clear()
  })

  it('goes to pairing when this tablet has no stored token', () => {
    setup()
    expect(router.navigateByUrl).toHaveBeenCalledWith('/kiosk/pair')
    http.expectNone(() => true)
  })

  it('shows the session rooms with their custom names, and sends only the device token', async () => {
    setup('tok-1')
    const req = http.expectOne(request => request.url.endsWith('/kiosk/session'))
    expect(req.request.headers.get('Authorization')).toBe('Kiosk tok-1')
    expect(req.request.headers.get('Authorization')?.startsWith('Bearer')).toBe(false)
    req.flush(SESSION)
    await tick()
    socket.connected = true
    socket.fire('connect')
    socket.fire('accessories-data', [
      hap({ type: 'Lightbulb', uniqueId: 'a' }),
    ])
    fixture.detectChanges()

    expect(socket.emit).toHaveBeenCalledWith('get-accessories')
    expect(text()).toContain('Lights')
    expect(text()).toContain('Ceiling')
    expect(text()).toContain('Kitchen')
  })

  it('shows the unpaired state when the server refuses the token, and forgets the pairing', async () => {
    setup('tok-1')
    http.expectOne(request => request.url.endsWith('/kiosk/session')).flush({}, { status: 401, statusText: 'Unauthorized' })
    await tick()
    fixture.detectChanges()

    expect(text()).toContain('kiosk.unpaired.title')
    expect(localStorage.getItem(KIOSK_DEVICE_STORAGE_KEY)).toBeNull()
  })

  it('shows a toast when a control fails on the device socket', async () => {
    setup('tok-1')
    http.expectOne(request => request.url.endsWith('/kiosk/session')).flush(SESSION)
    await tick()
    socket.fire('accessory-control-failure', 'Bridge offline')

    expect(toastr.error).toHaveBeenCalledWith('Bridge offline', expect.any(String))
  })
})

describe('kioskDeviceService storage', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    localStorage.clear()
  })

  it('round-trips the stored pairing and clears it', () => {
    expect(saveStoredDevice({ token: 't', deviceId: 'd' })).toBe(true)
    expect(loadStoredDevice()).toEqual({ token: 't', deviceId: 'd' })
    clearStoredDevice()
    expect(loadStoredDevice()).toBeNull()
  })

  it('treats unreadable storage as not paired, and reports a refused save', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    expect(loadStoredDevice()).toBeNull()
    expect(saveStoredDevice({ token: 't', deviceId: 'd' })).toBe(false)
  })

  it('does not keep a stored value that is missing its token', () => {
    localStorage.setItem(KIOSK_DEVICE_STORAGE_KEY, JSON.stringify({ deviceId: 'd' }))
    expect(loadStoredDevice()).toBeNull()
  })
})

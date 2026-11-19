import type { KioskDevice } from '@/app/modules/kiosk/kiosk-devices.service'
import type { ComponentFixture } from '@angular/core/testing'

import { TestBed } from '@angular/core/testing'
import { NgbActiveModal, NgbModal } from '@ng-bootstrap/ng-bootstrap/modal'
import { ToastrService } from 'ngx-toastr'
import { Subject } from 'rxjs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { AccessoriesService } from '@/app/core/accessories/accessories.service'
import { AuthService } from '@/app/core/auth/auth.service'
import { KioskDevicesService } from '@/app/modules/kiosk/kiosk-devices.service'
import { provideTestTranslate } from '@/testing/providers'

import { TabletPairComponent } from './tablet-pair.component'
import { UsersTabletsComponent } from './users-tablets.component'

function device(overrides: Partial<KioskDevice> = {}): KioskDevice {
  return {
    id: 'dev-1',
    name: 'Hall',
    owner: 'admin',
    viewId: 'favorites',
    viewName: 'Favorites',
    allowSensitive: false,
    allowedUniqueIds: ['a', 'b'],
    createdAt: '2026-01-01T00:00:00.000Z',
    paired: true,
    ...overrides,
  }
}

describe('usersTabletsComponent', () => {
  let fixture: ComponentFixture<UsersTabletsComponent>
  let devices: { list: ReturnType<typeof vi.fn>, remove: ReturnType<typeof vi.fn>, update: ReturnType<typeof vi.fn>, pairingCode: ReturnType<typeof vi.fn>, refreshDevice: ReturnType<typeof vi.fn>, ensureSession: ReturnType<typeof vi.fn>, releaseSession: ReturnType<typeof vi.fn>, views: ReturnType<typeof vi.fn>, resolveAllowed: ReturnType<typeof vi.fn> }
  let modal: { open: ReturnType<typeof vi.fn> }
  let toastr: { success: ReturnType<typeof vi.fn>, error: ReturnType<typeof vi.fn> }

  beforeEach(() => {
    devices = {
      list: vi.fn(async () => [
        device(),
      ]),
      remove: vi.fn(async () => {}),
      update: vi.fn(async () => device()),
      pairingCode: vi.fn(async () => ({
        code: 'ABCD2345',
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
      })),
      refreshDevice: vi.fn(async () => device()),
      ensureSession: vi.fn(async () => {}),
      releaseSession: vi.fn(),
      views: vi.fn(() => []),
      resolveAllowed: vi.fn(() => []),
    }
    modal = {
      open: vi.fn(() => ({
        result: Promise.resolve('ok'),
        componentInstance: {},
      })),
    }
    toastr = {
      success: vi.fn(),
      error: vi.fn(),
    }

    TestBed.configureTestingModule({
      imports: [UsersTabletsComponent],
      providers: [
        provideTestTranslate(),
        { provide: KioskDevicesService, useValue: devices },
        { provide: NgbModal, useValue: modal },
        { provide: ToastrService, useValue: toastr },
      ],
    })
    fixture = TestBed.createComponent(UsersTabletsComponent)
    fixture.detectChanges()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  async function settle(): Promise<void> {
    await fixture.whenStable()
    fixture.detectChanges()
  }

  function button(label: string): HTMLButtonElement {
    return [
      ...fixture.nativeElement.querySelectorAll('button'),
    ]
      .find((entry: any) => entry.textContent.includes(label)) as HTMLButtonElement
  }

  it('lists each tablet with its view, pairing state and accessory count', async () => {
    await settle()
    const text = fixture.nativeElement.textContent as string
    expect(devices.list).toHaveBeenCalled()
    expect(text).toContain('Hall')
    expect(text).toContain('Favorites')
    expect(text).toContain('kiosk.tablets.paired')
  })

  it('revokes only after the confirm dialog is accepted', async () => {
    await settle()
    modal.open.mockReturnValueOnce({
      result: Promise.reject(new Error('dismissed')),
    })
    button('kiosk.tablets.revoke').click()
    await settle()
    expect(devices.remove).not.toHaveBeenCalled()

    modal.open.mockReturnValueOnce({
      result: Promise.resolve(true),
    })
    button('kiosk.tablets.revoke').click()
    await settle()
    expect(devices.remove).toHaveBeenCalledWith('dev-1')
  })

  it('updates the sensitive setting straight away', async () => {
    await settle()
    const toggle = fixture.nativeElement.querySelector('input[role="switch"]') as HTMLInputElement
    toggle.checked = true
    toggle.dispatchEvent(new Event('change'))
    await settle()
    expect(devices.update).toHaveBeenCalledWith('dev-1', { allowSensitive: true })
  })

  it('refreshes the accessories of a tablet through the service', async () => {
    await settle()
    button('kiosk.tablets.refresh').click()
    await settle()
    expect(devices.refreshDevice).toHaveBeenCalledWith(expect.objectContaining({ id: 'dev-1' }))
  })
})

describe('tabletPairComponent', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-01T12:00:00.000Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('shows the code and counts down to expiry, then offers a new code', async () => {
    const pairingCode = vi.fn(async () => ({
      code: 'ABCD2345',
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    }))
    TestBed.configureTestingModule({
      imports: [TabletPairComponent],
      providers: [
        provideTestTranslate(),
        {
          provide: KioskDevicesService,
          useValue: { pairingCode },
        },
        {
          provide: NgbActiveModal,
          useValue: {
            close: vi.fn(),
            dismiss: vi.fn(),
          },
        },
        {
          provide: ToastrService,
          useValue: {
            error: vi.fn(),
          },
        },
        {
          provide: AccessoriesService,
          useValue: {
            viewsSaved: new Subject<void>(),
          },
        },
        {
          provide: AuthService,
          useValue: { user: {} },
        },
      ],
    })
    const fixture = TestBed.createComponent(TabletPairComponent)
    fixture.componentInstance.device = device()
    fixture.detectChanges()
    await fixture.whenStable()
    fixture.detectChanges()

    expect(pairingCode).toHaveBeenCalledWith('dev-1')
    expect(fixture.nativeElement.textContent).toContain('ABCD2345')
    expect(fixture.nativeElement.querySelector('app-qrcode')).not.toBeNull()
    expect(fixture.nativeElement.querySelector('code').textContent).toContain('/kiosk/pair?code=ABCD2345')

    vi.advanceTimersByTime(30_000)
    fixture.detectChanges()
    expect((fixture.componentInstance as any).countdown()).toBe('0:30')
    expect(fixture.nativeElement.querySelector('[role="timer"]')).not.toBeNull()

    vi.advanceTimersByTime(31_000)
    fixture.detectChanges()
    expect(fixture.nativeElement.querySelector('[role="alert"]')).not.toBeNull()
    expect(fixture.nativeElement.querySelector('.kiosk-pair-code')).toBeNull()
  })
})

describe('kioskDevicesService admin-only resync', () => {
  function setup(admin: boolean) {
    const viewsSaved = new Subject<void>()
    TestBed.resetTestingModule()
    const list = vi.fn(async () => [])
    TestBed.configureTestingModule({
      providers: [
        provideTestTranslate(),
        {
          provide: AuthService,
          useValue: {
            user: { admin, username: 'admin' },
          },
        },
        {
          provide: AccessoriesService,
          useValue: {
            viewsSaved,
            rooms: () => [
              { name: 'r', services: [] },
            ],
            views: () => [],
          },
        },
        {
          provide: ToastrService,
          useValue: {
            error: vi.fn(),
          },
        },
      ],
    })
    const service = TestBed.inject(KioskDevicesService)
    vi.spyOn(service, 'list').mockImplementation(list)
    return { viewsSaved, list }
  }

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('re-sends tablets after views are saved, for an admin', async () => {
    const { viewsSaved, list } = setup(true)
    viewsSaved.next()
    await Promise.resolve()
    expect(list).toHaveBeenCalled()
  })

  it('does nothing after views are saved, for a non-admin', async () => {
    const { viewsSaved, list } = setup(false)
    viewsSaved.next()
    await Promise.resolve()
    expect(list).not.toHaveBeenCalled()
  })
})

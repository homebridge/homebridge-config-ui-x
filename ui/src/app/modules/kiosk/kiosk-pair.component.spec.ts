import type { ComponentFixture } from '@angular/core/testing'

import { provideHttpClient } from '@angular/common/http'
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing'
import { TestBed } from '@angular/core/testing'
import { ActivatedRoute, convertToParamMap, provideRouter, Router } from '@angular/router'
import { ToastrService } from 'ngx-toastr'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { provideTestTranslate } from '@/testing/providers'

import { KIOSK_DEVICE_STORAGE_KEY } from './kiosk-device.service'
import { KioskPairComponent } from './kiosk-pair.component'

describe('kioskPairComponent', () => {
  let fixture: ComponentFixture<KioskPairComponent>
  let http: HttpTestingController
  let router: Router

  function setup(code?: string) {
    TestBed.configureTestingModule({
      imports: [KioskPairComponent],
      providers: [
        provideTestTranslate(),
        provideRouter([]),
        {
          provide: ToastrService,
          useValue: {
            error: vi.fn(),
            success: vi.fn(),
          },
        },
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              queryParamMap: convertToParamMap(code
                ? { code }
                : {}),
            },
          },
        },
      ],
    })
    fixture = TestBed.createComponent(KioskPairComponent)
    http = TestBed.inject(HttpTestingController)
    router = TestBed.inject(Router)
    vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true)
    fixture.detectChanges()
    return fixture
  }

  function input(): HTMLInputElement {
    return fixture.nativeElement.querySelector('#kiosk-pair-code') as HTMLInputElement
  }

  function submit(): void {
    fixture.nativeElement.querySelector('form').dispatchEvent(new Event('submit'))
  }

  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    localStorage.clear()
    http?.verify()
  })

  it('reads the code from the link and tidies it to capitals', () => {
    setup('ab-cd 2345')
    expect(input().value).toBe('ABCD2345')
  })

  it('stores the token and opens the device page on success', async () => {
    setup('ABCD2345')
    submit()

    const req = http.expectOne(request => request.url.endsWith('/kiosk/pair'))
    expect(req.request.body).toEqual({ code: 'ABCD2345' })
    expect(req.request.headers.has('Authorization')).toBe(false)
    req.flush({
      token: 'tok-1',
      device: { id: 'dev-1', name: 'Hall', viewName: 'Lights' },
    })
    await fixture.whenStable()

    expect(JSON.parse(localStorage.getItem(KIOSK_DEVICE_STORAGE_KEY)!)).toEqual({ token: 'tok-1', deviceId: 'dev-1' })
    expect(router.navigateByUrl).toHaveBeenCalledWith('/kiosk/device')
  })

  it('shows an error for a code the server rejects, and stores nothing', async () => {
    setup('ABCD2345')
    submit()
    http.expectOne(request => request.url.endsWith('/kiosk/pair')).flush({}, { status: 404, statusText: 'Not Found' })
    await fixture.whenStable()
    fixture.detectChanges()

    expect(fixture.nativeElement.querySelector('#kiosk-pair-error').textContent.trim()).not.toBe('')
    expect(localStorage.getItem(KIOSK_DEVICE_STORAGE_KEY)).toBeNull()
    expect(router.navigateByUrl).not.toHaveBeenCalled()
  })

  it('does not navigate when storage refuses the pairing', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    setup('ABCD2345')
    submit()
    http.expectOne(request => request.url.endsWith('/kiosk/pair')).flush({
      token: 'tok',
      device: { id: 'd', name: 'n', viewName: 'v' },
    })
    await fixture.whenStable()
    fixture.detectChanges()

    expect(router.navigateByUrl).not.toHaveBeenCalled()
    expect(fixture.nativeElement.querySelector('#kiosk-pair-error').textContent.trim()).not.toBe('')
  })
})

import type { ComponentFixture } from '@angular/core/testing'

import { TestBed } from '@angular/core/testing'
import { provideRouter, Router } from '@angular/router'
import { ToastPackage, ToastrService } from 'ngx-toastr'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { TokenCacheService } from '@/app/core/auth/token-cache.service'
import { setStoredToken } from '@/app/core/auth/token-store'
import { AppToastComponent } from '@/app/core/components/app-toast/app-toast.component'
import { QrcodeComponent } from '@/app/core/components/qrcode/qrcode.component'
import { RestartToastComponent } from '@/app/core/components/restart-toast/restart-toast.component'
import { MonacoEditorService, onMonacoLoad } from '@/app/core/ui/monaco-editor.service'
import { toastPackageStub, toastrStub } from '@/testing'
import { provideTestTranslate } from '@/testing/providers'

/**
 * The small shared pieces: two custom toasts, the QR code renderer, and two
 * one-method services.
 *
 * ⚠️ Four other components in this area are deliberately NOT covered, because
 * there is nothing in them to assert: `RequiredIndicatorComponent`,
 * `DragHerePlaceholderComponent`, `SupportBannerComponent` and
 * `UsersSupportComponent` are static templates with no logic, no inputs and no
 * outputs. A spec for them would test Angular, not this app.
 */
describe('the small shared components', () => {
  describe('the accessible toast', () => {
    let fixture: ComponentFixture<AppToastComponent>

    /**
     * Build the toast ngx-toastr would build.
     * @param message - the toast body
     * @param title - the optional toast heading
     */
    function create(message: string, title?: string) {
      TestBed.resetTestingModule()
      TestBed.configureTestingModule({
        imports: [AppToastComponent],
        providers: [
          provideTestTranslate(),
          { provide: ToastrService, useValue: toastrStub() },
          { provide: ToastPackage, useValue: toastPackageStub({ message, title }).package },
        ],
      })

      fixture = TestBed.createComponent(AppToastComponent)
      fixture.detectChanges()
      return fixture.nativeElement as HTMLElement
    }

    it('announces the message through a live region', () => {
      // `role="alert"` is what actually makes a screen reader read the toast
      const host = create('Plugin installed')

      expect(host.querySelector('[role="alert"]')?.textContent?.trim()).toBe('Plugin installed')
    })

    it('does not label the message as well as announcing it', () => {
      // ngx-toastr's own template adds an aria-label duplicating the visible
      // text, which made VoiceOver read every toast three times
      const host = create('Plugin installed', 'Success')

      expect(host.querySelector('[role="alert"]')?.getAttribute('aria-label')).toBeNull()
      expect(host.querySelector('.toast-title')?.getAttribute('aria-label')).toBeNull()
    })

    it('keeps the close button labelled, since it has no visible text', () => {
      const host = create('Plugin installed')

      expect(host.querySelector('.toast-close-button')?.getAttribute('aria-label')).toBe('Close')
    })

    it('hides the decorative cross from screen readers', () => {
      const host = create('Plugin installed')

      expect(host.querySelector('.toast-close-button span')?.getAttribute('aria-hidden')).toBe('true')
    })

    it('shows the title when there is one', () => {
      const host = create('Plugin installed', 'Success')

      expect(host.querySelector('.toast-title')?.textContent?.trim()).toBe('Success')
    })
  })

  describe('the restart toast', () => {
    let navigate: ReturnType<typeof vi.fn>
    let toastr: ReturnType<typeof toastrStub>

    function create() {
      TestBed.resetTestingModule()

      const stub = toastPackageStub({ message: 'Changes need a restart', title: 'Restart Homebridge' })
      toastr = toastrStub()

      TestBed.configureTestingModule({
        imports: [RestartToastComponent],
        providers: [
          provideRouter([]),
          provideTestTranslate(),
          { provide: ToastrService, useValue: toastr },
          { provide: ToastPackage, useValue: stub.package },
        ],
      })

      const fixture = TestBed.createComponent(RestartToastComponent)
      navigate = vi.fn(async () => true)
      vi.spyOn(TestBed.inject(Router), 'navigate').mockImplementation(navigate as any)
      fixture.detectChanges()
      return { fixture, component: fixture.componentInstance, host: fixture.nativeElement as HTMLElement }
    }

    it('offers the restart as a real focusable button', () => {
      // The whole point of this toast over the built-in one: a keyboard user
      // can reach the action
      const { host } = create()

      const action = host.querySelector('.hb-restart-toast-action')
      expect(action?.tagName).toBe('BUTTON')
      expect(action?.textContent).toContain('Restart Homebridge')
    })

    it('sends the user to the restart page and closes itself', () => {
      // ⚠️ Asserted on the toast's own `state`, not on ToastrService.remove:
      // `Toast.remove()` schedules that call through ngx-toastr's injected
      // TimeoutsService, which fake timers do not reach. Marking itself removed
      // is the part this component is responsible for
      const { component } = create()

      component.restart()

      expect(navigate).toHaveBeenCalledWith(['/restart'])
      expect(component.state()).toBe('removed')
    })

    it('closes without restarting when dismissed', () => {
      const { component } = create()

      component.dismiss()

      expect(component.state()).toBe('removed')
      expect(navigate).not.toHaveBeenCalled()
    })

    it('announces the message through a live region', () => {
      const { host } = create()

      expect(host.querySelector('[role="alert"]')?.textContent?.trim()).toBe('Changes need a restart')
    })

    it('labels the close button, which has no visible text', () => {
      const { host } = create()

      expect(host.querySelector('.toast-close-button')?.getAttribute('aria-label')).toBe('form.button_close')
    })
  })

  describe('the QR code', () => {
    async function render(data: string, darkMode = false) {
      TestBed.resetTestingModule()
      document.body.classList.toggle('dark-mode', darkMode)
      TestBed.configureTestingModule({ imports: [QrcodeComponent] })

      const fixture = TestBed.createComponent(QrcodeComponent)
      fixture.componentRef.setInput('data', data)
      fixture.detectChanges()
      for (let tick = 0; tick < 10; tick += 1) {
        await Promise.resolve()
      }
      fixture.detectChanges()
      return fixture.nativeElement as HTMLElement
    }

    it('draws the pairing code as an svg', () => {
      // Not an image: the pairing code has to stay crisp at any size
      return render('X-HM://0024MDTOP1234').then((host) => {
        expect(host.querySelector('svg')).not.toBeNull()
      })
    })

    it('marks the code so the theme can colour it', async () => {
      const host = await render('X-HM://0024MDTOP1234')

      expect(host.querySelector('svg path')?.classList.contains('qr-code-theme-color')).toBe(true)
    })

    it('draws in white on a dark theme', async () => {
      const host = await render('X-HM://0024MDTOP1234', true)

      expect(host.querySelector('svg')?.innerHTML).toContain('#FFF')
    })

    it('draws in black on a light theme', async () => {
      const host = await render('X-HM://0024MDTOP1234', false)

      expect(host.querySelector('svg')?.innerHTML).toContain('#000')
    })

    it('draws nothing at all when there is no code yet', async () => {
      // The pairing widget renders this before the bridge has reported its code
      const host = await render('')

      expect(host.querySelector('svg')).toBeNull()
    })
  })

  describe('the token cache service', () => {
    let service: TokenCacheService

    beforeEach(() => {
      TestBed.resetTestingModule()
      TestBed.configureTestingModule({ providers: [] })
      service = TestBed.inject(TokenCacheService)
    })

    it('hands back the token the store holds', () => {
      setStoredToken('a-test-token')

      expect(service.getToken()).toBe('a-test-token')
    })

    it('hands back nothing when the user is signed out', () => {
      setStoredToken(null)

      expect(service.getToken()).toBeNull()
    })

    it('reads the store each time rather than remembering', () => {
      // The name is historical - the token lives in memory now, so there is
      // nothing to cache. A stale read here would keep a logged-out session
      // looking signed in
      setStoredToken('first')
      expect(service.getToken()).toBe('first')

      setStoredToken('second')
      expect(service.getToken()).toBe('second')
    })

    it('still answers the invalidate call callers make', () => {
      // Retained as a no-op so callers did not have to change
      setStoredToken('a-test-token')

      service.invalidateCache()

      expect(service.getToken()).toBe('a-test-token')
    })
  })

  describe('the monaco editor service', () => {
    it('tells its subscribers when the editor has loaded', () => {
      TestBed.resetTestingModule()
      const service = TestBed.inject(MonacoEditorService)
      const ready = vi.fn()
      service.readyEvent.subscribe(ready)

      onMonacoLoad()

      expect(ready).toHaveBeenCalled()
    })

    it('shares one event across every injected instance', () => {
      // ⚠️ The Subject is module-level, not per-instance. Monaco loads once per
      // page, so a per-instance Subject would leave a second consumer waiting
      // for an event that had already fired
      TestBed.resetTestingModule()
      const first = TestBed.inject(MonacoEditorService)
      TestBed.resetTestingModule()
      const second = TestBed.inject(MonacoEditorService)

      expect(first.readyEvent).toBe(second.readyEvent)
    })
  })
})

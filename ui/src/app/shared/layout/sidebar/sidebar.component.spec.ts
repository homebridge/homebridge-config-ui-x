import type { FakeAuth, FakeModalService, FakeSettings, FakeToastr } from '@/testing'
import type { WritableSignal } from '@angular/core'
import type { ComponentFixture } from '@angular/core/testing'

import { ChangeDetectorRef, Component, signal } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { NavigationEnd, NavigationStart, provideRouter, Router } from '@angular/router'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { AuthHelperService } from '@/app/core/auth/auth-helper.service'
import { NotificationService } from '@/app/core/communication/notification.service'
import { InformationComponent } from '@/app/core/components/information/information.component'
import { INFORMATION_MODAL_DATA } from '@/app/core/modal-data-tokens'
import { SidebarComponent } from '@/app/shared/layout/sidebar/sidebar.component'
import { makeAuth, makeSettings, modalServiceSpy, toastrStub } from '@/testing'
import { provideFakes, provideTestTranslate } from '@/testing/providers'

/**
 * The sidebar is the app's permission surface: what a user can see here is
 * what they can reach. The matrix below is the whole of it, so a condition
 * accidentally dropped or inverted shows up as a menu item appearing for
 * someone who should not have it.
 *
 * The sidebar is hosted with a `.content` sibling because that is how the
 * layout renders it, and the component reaches out for that element on init.
 */
@Component({
  selector: 'app-sidebar-host',
  imports: [SidebarComponent],
  template: `<app-sidebar />
<div class="content"></div>
`,
})
class HostComponent {}

describe('SidebarComponent', () => {
  let auth: FakeAuth
  let settings: FakeSettings
  let toastr: FakeToastr
  let modal: FakeModalService
  let notification: {
    raspberryPiThrottled: WritableSignal<Record<string, boolean>>
    formAuthEnabled: WritableSignal<boolean | null>
    legacyOtpDetected: WritableSignal<boolean>
  }
  let authHelper: { isAuthenticated: ReturnType<typeof vi.fn> }
  let fixture: ComponentFixture<HostComponent>

  interface Options {
    admin?: boolean
    terminal?: boolean
    restrictLogs?: boolean
    formAuth?: boolean
    pwa?: boolean
    authenticated?: boolean
    narrow?: boolean
  }

  function render(options: Options = {}): HTMLElement {
    // ⚠️ Read from the window in the constructor, so it has to be in place before
    // the component is built - the mobile and desktop paths attach different
    // listeners and there is no switching between them afterwards
    Object.defineProperty(window, 'innerWidth', {
      value: options.narrow ? 400 : 1024,
      configurable: true,
      writable: true,
    })

    auth = makeAuth({ user: { admin: options.admin ?? true } })
    toastr = toastrStub()
    modal = modalServiceSpy()
    notification = {
      raspberryPiThrottled: signal<Record<string, boolean>>({}),
      formAuthEnabled: signal<boolean | null>(null),
      legacyOtpDetected: signal(false),
    }
    authHelper = { isAuthenticated: vi.fn(async () => options.authenticated ?? true) }
    settings = makeSettings({
      formAuth: options.formAuth ?? true,
      env: {
        enableTerminalAccess: options.terminal ?? true,
        restrictLogsToAdmins: options.restrictLogs ?? false,
      },
    })

    TestBed.configureTestingModule({
      imports: [HostComponent],
      providers: [
        provideRouter([]),
        provideTestTranslate(),
        provideFakes({ auth, settings, toastr, modal }),
        { provide: AuthHelperService, useValue: authHelper },
        { provide: NotificationService, useValue: notification },
      ],
    })

    fixture = TestBed.createComponent(HostComponent)
    fixture.detectChanges()

    // ⚠️ Set on the component rather than by mocking `is-standalone-pwa`.
    //
    // A `vi.mock` of that module is not reliable here: vite resolves it to a
    // different module id for the spec than for the component once the file
    // imports enough else, and the mock then silently fails to intercept - every
    // case in the file dies on "mockReturnValue is not a function". The flag is
    // read once into a plain field, so writing to it is equivalent and cannot
    // come apart.
    sidebar().isPwa = options.pwa ?? false
    // ⚠️ A plain field does not mark an OnPush component dirty the way a signal
    // does, so the view has to be told the value changed
    fixture.debugElement.children[0].injector.get(ChangeDetectorRef).markForCheck()
    fixture.detectChanges()

    return fixture.nativeElement as HTMLElement
  }

  /**
   * Every item the menu currently offers, by its label. Nothing is loaded in
   * tests, so the translate pipe renders the key itself - which is the stable
   * thing to assert on.
   */
  function items(element: HTMLElement): string[] {
    return [...element.querySelectorAll('app-sidebar .title')]
      .map(node => node.textContent!.trim())
      .filter(Boolean)
  }

  beforeEach(() => {
    window.sessionStorage.clear()
  })

  describe('what an admin can reach', () => {
    it('offers every section', () => {
      const element = render({ admin: true, terminal: true })

      expect(items(element)).toEqual([
        'menu.label_status',
        'menu.label_plugins',
        'menu.label_accessories',
        'menu.linux.label_logs',
        'menu.linux.label_terminal',
        'menu.config_json_editor',
        'menu.label_settings',
        'support.title',
        'menu.restart.title',
        'menu.tooltip_logout',
      ])
    })
  })

  describe('what a non-admin can reach', () => {
    it('offers only the sections they are allowed', () => {
      const element = render({ admin: false })

      expect(items(element)).toEqual([
        'menu.label_status',
        'menu.label_plugins',
        'menu.label_accessories',
        'menu.linux.label_logs',
        'support.title',
        'menu.tooltip_logout',
      ])
    })

    it.each([
      ['the config editor', 'menu.config_json_editor'],
      ['the settings page', 'menu.label_settings'],
      ['the power options', 'menu.restart.title'],
      ['the terminal', 'menu.linux.label_terminal'],
    ])('hides %s', (_name, label) => {
      const element = render({ admin: false, terminal: true })

      expect(items(element)).not.toContain(label)
    })
  })

  describe('the terminal', () => {
    it.each([
      ['an admin with terminal access', { admin: true, terminal: true }, true],
      ['an admin without terminal access', { admin: true, terminal: false }, false],
      ['a non-admin with terminal access', { admin: false, terminal: true }, false],
      ['a non-admin without terminal access', { admin: false, terminal: false }, false],
    ])('is %s shown: %s', (_case, options, expected) => {
      const element = render(options)

      expect(items(element).includes('menu.linux.label_terminal')).toBe(expected)
    })
  })

  describe('the log viewer', () => {
    it.each([
      ['an admin while unrestricted', { admin: true, restrictLogs: false }, true],
      ['an admin while restricted', { admin: true, restrictLogs: true }, true],
      ['a non-admin while unrestricted', { admin: false, restrictLogs: false }, true],
      ['a non-admin while restricted', { admin: false, restrictLogs: true }, false],
    ])('is %s shown: %s', (_case, options, expected) => {
      const element = render(options)

      expect(items(element).includes('menu.linux.label_logs')).toBe(expected)
    })
  })

  describe('signing out', () => {
    it('is offered when the ui has a login', () => {
      const element = render({ formAuth: true })

      expect(items(element)).toContain('menu.tooltip_logout')
    })

    it('is hidden when the ui has no login', () => {
      // There is nothing to sign out of, and the button would just reload
      const element = render({ formAuth: false })

      expect(items(element)).not.toContain('menu.tooltip_logout')
    })
  })

  describe('the reload button', () => {
    it('is offered in an installed app', () => {
      // A standalone PWA has no browser reload control of its own
      const element = render({ pwa: true })

      expect(items(element)).toContain('menu.reload')
    })

    it('is hidden in a normal browser tab', () => {
      const element = render({ pwa: false })

      expect(items(element)).not.toContain('menu.reload')
    })
  })

  describe('the raspberry pi power warning', () => {
    it('is hidden while the power is healthy', () => {
      const element = render()

      expect(items(element)).not.toContain('rpi.throttled.undervoltage_title')
    })

    it.each([
      ['the pi is under voltage now', 'rPiCurrentlyUnderVoltage'],
      ['the pi was under voltage earlier', 'rPiWasUnderVoltage'],
    ])('appears once %s', (_case, signalName) => {
      const element = render()
      const sidebar = fixture.debugElement.children[0].componentInstance as SidebarComponent;
      (sidebar as any)[signalName].set(true)
      fixture.detectChanges()

      expect(items(element)).toContain('rpi.throttled.undervoltage_title')
    })
  })

  /** The data the information modal was opened with. */
  function informationData(): { message?: string, ctaButtonLink?: string } | undefined {
    return modal.dataFor(INFORMATION_MODAL_DATA) as { message?: string, ctaButtonLink?: string } | undefined
  }

  /** The sidebar component behind the host. */
  function sidebar(): SidebarComponent {
    return fixture.debugElement.children[0].componentInstance as SidebarComponent
  }

  /**
   * Navigating away from the page.
   *
   * ⚠️ **The sidebar is what checks the session is still good.** With form auth on,
   * a token that expired while the page sat open would otherwise let the user click
   * into a page that then fails every request. It redirects to the login page and
   * keeps the route they wanted, so signing in again takes them there rather than
   * back to the dashboard.
   */
  describe('navigating with an expired session', () => {
    /**
     * Fire a router event at the sidebar.
     *
     * ⚠️ Cast to `any` rather than to `Subject`: a top-level `rxjs` import in this
     * file defeats the `vi.mock` of `is-standalone-pwa` above, and every case here
     * then dies on `vi.mocked(...).mockReturnValue is not a function`.
     * @param event - the event to fire
     */
    async function fire(event: unknown) {
      ;(TestBed.inject(Router).events as any).next(event)
      for (let tick = 0; tick < 8; tick += 1) {
        await Promise.resolve()
      }
    }

    it('sends the user to the login page when the token has gone stale', async () => {
      render({ formAuth: true, authenticated: false })
      const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true)

      await fire(new NavigationStart(1, '/plugins'))

      expect(navigate).toHaveBeenCalledWith(['/login'])
    })

    it('remembers where they were going', async () => {
      render({ formAuth: true, authenticated: false })
      vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true)

      await fire(new NavigationStart(1, '/plugins'))

      expect(window.sessionStorage.getItem('target_route')).toBe('/plugins')
    })

    it('lets a good session through', async () => {
      render({ formAuth: true, authenticated: true })
      const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true)

      await fire(new NavigationStart(1, '/plugins'))

      expect(navigate).not.toHaveBeenCalled()
    })

    it('does not check the session on the way to the login page', async () => {
      // It would redirect the login page to itself
      render({ formAuth: true, authenticated: false })

      await fire(new NavigationStart(1, '/login'))

      expect(authHelper.isAuthenticated).not.toHaveBeenCalled()
    })

    it('checks nothing when login is switched off', async () => {
      render({ formAuth: false, authenticated: false })

      await fire(new NavigationStart(1, '/plugins'))

      expect(authHelper.isAuthenticated).not.toHaveBeenCalled()
    })

    it('closes the menu once a page has loaded', async () => {
      render()
      sidebar().toggleSidebar()
      expect(sidebar().isExpanded()).toBe(true)

      await fire(new NavigationEnd(1, '/plugins', '/plugins'))

      expect(sidebar().isExpanded()).toBe(false)
    })

    it('holds the menu shut briefly, so a hover does not reopen it', async () => {
      // ⚠️ Without the freeze, the pointer left sitting where the menu button was
      // opens it again the moment the new page renders
      vi.useFakeTimers()
      render()

      await fire(new NavigationEnd(1, '/plugins', '/plugins'))
      expect(sidebar().freezeMenu()).toBe(true)

      sidebar().toggleSidebar()
      expect(sidebar().isExpanded()).toBe(false)

      await vi.advanceTimersByTimeAsync(750)
      expect(sidebar().freezeMenu()).toBe(false)
      vi.useRealTimers()
    })
  })

  describe('what the server tells it', () => {
    it('follows the form-auth setting when it arrives', () => {
      render({ formAuth: true })

      notification.formAuthEnabled.set(false)
      fixture.detectChanges()

      expect(sidebar().formAuth()).toBe(false)
    })

    it('ignores a form-auth value that has not been decided yet', () => {
      render({ formAuth: true })

      notification.formAuthEnabled.set(null)
      fixture.detectChanges()

      expect(sidebar().formAuth()).toBe(true)
    })

    it('warns when the pi is under voltage right now', () => {
      render()

      notification.raspberryPiThrottled.set({ 'Under Voltage': true })
      fixture.detectChanges()

      expect(sidebar().rPiCurrentlyUnderVoltage()).toBe(true)
    })

    it('warns when the pi was under voltage earlier', () => {
      render()

      notification.raspberryPiThrottled.set({ 'Under-voltage has occurred': true })
      fixture.detectChanges()

      expect(sidebar().rPiWasUnderVoltage()).toBe(true)
      expect(sidebar().rPiCurrentlyUnderVoltage()).toBe(false)
    })
  })

  describe('the under voltage explanation', () => {
    it('says the power is failing now when it is', () => {
      render()
      notification.raspberryPiThrottled.set({ 'Under Voltage': true })
      fixture.detectChanges()

      sidebar().openUnderVoltageModal()

      expect(modal.lastOpened()!.content).toBe(InformationComponent)
      expect(informationData()?.message).toBe('rpi.throttled.currently_message')
    })

    it('says it happened earlier when the power has recovered', () => {
      render()
      notification.raspberryPiThrottled.set({ 'Under-voltage has occurred': true })
      fixture.detectChanges()

      sidebar().openUnderVoltageModal()

      expect(informationData()?.message).toBe('rpi.throttled.previously_message')
    })

    it('links out to an explanation of the warning', () => {
      render()

      sidebar().openUnderVoltageModal()

      expect(informationData()?.ctaButtonLink).toContain('raspberry-pi-low-voltage-warning')
    })
  })

  describe('the legacy two factor warning', () => {
    it('warns the user, once, a few seconds after the page settles', async () => {
      // ⚠️ Delayed on purpose: it would otherwise land on top of everything else a
      // fresh page load throws up
      vi.useFakeTimers()
      render()

      notification.legacyOtpDetected.set(true)
      fixture.detectChanges()
      expect(toastr.warning).not.toHaveBeenCalled()

      await vi.advanceTimersByTimeAsync(3000)
      expect(toastr.warning).toHaveBeenCalledTimes(1)
      vi.useRealTimers()
    })

    it('leaves it on screen until the user dismisses it', async () => {
      // It needs acting on, so it must not time out unseen
      vi.useFakeTimers()
      render()

      notification.legacyOtpDetected.set(true)
      fixture.detectChanges()
      await vi.advanceTimersByTimeAsync(3000)

      expect(vi.mocked(toastr.warning).mock.calls[0][2]).toMatchObject({ disableTimeOut: true, tapToDismiss: true })
      vi.useRealTimers()
    })

    it('does not warn twice', async () => {
      vi.useFakeTimers()
      render()

      notification.legacyOtpDetected.set(true)
      fixture.detectChanges()
      await vi.advanceTimersByTimeAsync(3000)
      notification.legacyOtpDetected.set(false)
      notification.legacyOtpDetected.set(true)
      fixture.detectChanges()
      await vi.advanceTimersByTimeAsync(3000)

      expect(toastr.warning).toHaveBeenCalledTimes(1)
      vi.useRealTimers()
    })

    it('says nothing when no legacy secret was found', async () => {
      vi.useFakeTimers()
      render()

      await vi.advanceTimersByTimeAsync(3000)

      expect(toastr.warning).not.toHaveBeenCalled()
      vi.useRealTimers()
    })
  })

  describe('opening and closing the menu', () => {
    it('opens and closes on the toggle', () => {
      render()

      sidebar().toggleSidebar()
      expect(sidebar().isExpanded()).toBe(true)

      sidebar().toggleSidebar()
      expect(sidebar().isExpanded()).toBe(false)
    })

    it('dims the page behind it while it is open', () => {
      const element = render()

      sidebar().toggleSidebar()

      const content = element.querySelector('.content') as HTMLElement
      expect(content.style.opacity).toBe('20%')
      expect(content.style.pointerEvents).toBe('none')
    })

    it('gives the page back when it closes', () => {
      const element = render()
      sidebar().toggleSidebar()

      sidebar().toggleSidebar()

      const content = element.querySelector('.content') as HTMLElement
      expect(content.style.opacity).toBe('')
      expect(content.style.pointerEvents).toBe('')
    })

    it('ignores the toggle while the menu is frozen', () => {
      render()
      sidebar().freezeMenu.set(true)

      sidebar().toggleSidebar()

      expect(sidebar().isExpanded()).toBe(false)
    })
  })

  describe('keyboard use', () => {
    it('activates a menu item on enter', () => {
      render()
      const target = document.createElement('a')
      target.setAttribute('role', 'menuitem')
      const click = vi.spyOn(target, 'click')

      sidebar().handleKeydown({ key: 'Enter', target } as unknown as KeyboardEvent)

      expect(click).toHaveBeenCalled()
    })

    it('does nothing for any other key', () => {
      render()
      const target = document.createElement('a')
      target.setAttribute('role', 'menuitem')
      const click = vi.spyOn(target, 'click')

      sidebar().handleKeydown({ key: 'a', target } as unknown as KeyboardEvent)

      expect(click).not.toHaveBeenCalled()
    })

    it('does nothing for an element that is not a control', () => {
      render()
      const target = document.createElement('div')
      target.setAttribute('role', 'presentation')
      const click = vi.spyOn(target, 'click')

      sidebar().handleKeydown({ key: 'Enter', target } as unknown as KeyboardEvent)

      expect(click).not.toHaveBeenCalled()
    })
  })

  /**
   * Closing the menu by touch on a narrow screen.
   *
   * ⚠️ **On a phone the open menu covers the page.** There is no room for a close
   * button beside it, so tapping the page behind it is the way out — and the tap
   * has to be swallowed, or it also activates whatever it landed on underneath.
   */
  describe('the menu on a narrow screen', () => {
    /** Tap an element, the way a finger does. */
    function tap(target: Element) {
      const event = new Event('touchstart', { bubbles: true, cancelable: true })
      target.dispatchEvent(event)
      return event
    }

    /** Open the menu, on a narrow window. */
    function openOnPhone() {
      const element = render({ narrow: true })
      sidebar().isExpanded.set(true)
      return element
    }

    it('closes the menu when the page behind it is tapped', async () => {
      const element = openOnPhone()

      tap(element.querySelector('.content')!)

      expect(sidebar().isExpanded()).toBe(false)
    })

    it('swallows that tap rather than letting it through', async () => {
      // ⚠️ Otherwise the tap that closes the menu also presses whatever was under
      // it, and the user lands on a page they never chose
      const element = openOnPhone()

      const event = tap(element.querySelector('.content')!)

      expect(event.defaultPrevented).toBe(true)
    })

    it('closes the menu when anything else outside it is tapped', async () => {
      openOnPhone()
      const elsewhere = document.createElement('div')
      document.body.append(elsewhere)

      tap(elsewhere)

      expect(sidebar().isExpanded()).toBe(false)
      elsewhere.remove()
    })

    it('leaves a tap inside the menu alone', async () => {
      // The menu items have to stay usable
      const element = openOnPhone()

      tap(element.querySelector('.sidebar')!)

      expect(sidebar().isExpanded()).toBe(true)
    })

    it('does nothing while the menu is already closed', async () => {
      const element = render({ narrow: true })
      sidebar().isExpanded.set(false)

      const event = tap(element.querySelector('.content')!)

      expect(sidebar().isExpanded()).toBe(false)
      expect(event.defaultPrevented).toBe(false)
    })

    it('does not listen for taps on a desktop window', async () => {
      // The desktop layout closes on click instead, and both at once would close
      // the menu twice over
      const element = render()
      sidebar().isExpanded.set(true)

      const event = tap(element.querySelector('.content')!)

      expect(event.defaultPrevented).toBe(false)
    })
  })

  /**
   * The menu on a desktop window.
   *
   * ⚠️ **The menu opens on hover and closes on a click past it.** The 60-pixel
   * cut-off is what separates "clicked an item in the collapsed strip" from
   * "clicked in the expanded panel" — a click on an item should follow the link
   * and close the menu, not close it out from under the click.
   */
  describe('the menu on a desktop window', () => {
    /** Click somewhere, at a given distance from the left edge. */
    function clickAt(target: Element, clientX: number) {
      const event = new MouseEvent('click', { bubbles: true, cancelable: true, clientX })
      target.dispatchEvent(event)
      return event
    }

    it('opens when the pointer enters the header', () => {
      const element = render()
      sidebar().isExpanded.set(false)

      element.querySelector('.m-header')!.dispatchEvent(new Event('mouseenter'))

      expect(sidebar().isExpanded()).toBe(true)
    })

    it('closes again when the pointer leaves', () => {
      const element = render()
      sidebar().isExpanded.set(true)

      element.querySelector('.m-header')!.dispatchEvent(new Event('mouseleave'))

      expect(sidebar().isExpanded()).toBe(false)
    })

    it('stays put while the menu is frozen', () => {
      // ⚠️ The freeze is what stops the menu flapping open as the pointer crosses
      // it on the way somewhere else, and it has to hold for both directions
      const element = render()
      sidebar().isExpanded.set(false)
      sidebar().freezeMenu.set(true)

      element.querySelector('.m-header')!.dispatchEvent(new Event('mouseenter'))

      expect(sidebar().isExpanded()).toBe(false)
    })

    it('closes on a click in the expanded part of the menu', () => {
      const element = render()
      sidebar().isExpanded.set(true)

      clickAt(element.querySelector('.sidebar')!, 200)

      expect(sidebar().isExpanded()).toBe(false)
    })

    it('leaves it open for a click in the collapsed strip', () => {
      // That strip is the icon column, and closing on it would take the menu away
      // as the user reaches for the item they just pressed
      const element = render()
      sidebar().isExpanded.set(true)

      clickAt(element.querySelector('.sidebar')!, 30)

      expect(sidebar().isExpanded()).toBe(true)
    })

    it('ignores a click outside the menu entirely', () => {
      const element = render()
      sidebar().isExpanded.set(true)

      clickAt(element.querySelector('.content')!, 400)

      expect(sidebar().isExpanded()).toBe(true)
    })

    it('does not listen for clicks on a narrow window', () => {
      // The phone layout closes on touch instead, and both at once would fight
      const element = render({ narrow: true })
      sidebar().isExpanded.set(true)

      clickAt(element.querySelector('.sidebar')!, 200)

      expect(sidebar().isExpanded()).toBe(true)
    })
  })
})

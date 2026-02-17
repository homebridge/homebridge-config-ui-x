import { AfterViewInit, ChangeDetectionStrategy, Component, ElementRef, inject, OnDestroy, OnInit, viewChild } from '@angular/core'
import { TranslatePipe, TranslateService } from '@ngx-translate/core'
import { Subject } from 'rxjs'

import { SettingsService } from '@/app/core/ui/settings.service'
import { TerminalNavigationGuardService } from '@/app/core/utilities/terminal-navigation-guard.service'
import { TerminalService } from '@/app/core/utilities/terminal.service'

@Component({
  imports: [TranslatePipe],
  standalone: true,
  templateUrl: './terminal.component.html',
  styleUrl: './terminal.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(window:resize)': 'onWindowResize()',
    '(window:beforeunload)': 'onBeforeUnload($event)',
    '(window:focus)': 'onWindowFocus()',
    '(click)': 'onClick()',
  },
})
export class TerminalComponent implements OnInit, AfterViewInit, OnDestroy {
  private $terminal = inject(TerminalService)
  private $settings = inject(SettingsService)
  private $navigationGuard = inject(TerminalNavigationGuardService)
  private $translate = inject(TranslateService)
  private resizeEvent = new Subject<void>()

  readonly termTarget = viewChild<ElementRef>('terminaloutput')

  private visibilityChangeHandler: (() => void) | null = null

  onWindowResize() {
    this.resizeEvent.next(undefined)
  }

  onBeforeUnload(event: BeforeUnloadEvent) {
    return this.$navigationGuard.handleBeforeUnload(event)
  }

  onWindowFocus() {
    // Autofocus terminal when user returns to this window
    this.activateTerminal()
  }

  onClick() {
    // Focus this terminal when clicked
    this.activateTerminal()
  }

  private activateTerminal(): void {
    // Only focus if this terminal is ready and connected
    if (this.$terminal.isTerminalReady() && this.$terminal.term) {
      // Focus the actual terminal element for better UX
      this.$terminal.term.focus()
    }
  }

  private patchXtermLiveRegion(): void {
    const host = this.termTarget()?.nativeElement as HTMLElement | undefined
    if (!host) {
      return
    }

    const live = host.querySelector('[aria-live]') as HTMLElement | null
    if (!live) {
      return
    }

    live.setAttribute('role', 'status')
    live.setAttribute('aria-live', 'polite')
    live.setAttribute('aria-atomic', 'true')
  }

  public ngOnInit(): void {
    // Set page title
    const title = this.$translate.instant('menu.linux.label_terminal')
    this.$settings.setPageTitle(title)

    // Get terminal theme (light or dark) - enforces dark mode override
    const terminalTheme = this.$settings.getEffectiveTerminalLightingMode()

    // Set body bg color based on terminal theme
    if (terminalTheme === 'dark') {
      window.document.querySelector('body').classList.add('bg-black')
    } else {
      window.document.querySelector('body').classList.add('bg-white')
    }

    // Add transition class only when main theme is light AND terminal theme is dark
    // This creates smooth transitions when light mode users navigate to dark terminal pages
    const needsTransition = (
      this.$settings.actualLightingMode === 'light'
      && terminalTheme === 'dark'
    )

    if (needsTransition) {
      window.document.querySelector('body').classList.add('theme-transition')
      const terminal = this.termTarget()?.nativeElement
      if (terminal) {
        terminal.classList.add('theme-transition')
      }
    }

    // Always ensure clean state when component initializes
    // This prevents event handler duplication and state inconsistencies
    if (this.$terminal.isTerminalReady()) {
      // Clean up existing terminal completely before proceeding
      this.$terminal.destroyTerminal()
    }

    // Start or reconnect to the terminal based on current persistence state
    if (this.$settings.env.terminal?.persistence && this.$terminal.hasActiveSession()) {
      this.$terminal.reconnectTerminal(this.termTarget(), this.$settings.getTerminalOptions({
        screenReaderMode: true,
      }), this.resizeEvent)
    } else {
      // If persistence is disabled but there's still an active session, destroy it first
      if (!this.$settings.env.terminal?.persistence && this.$terminal.hasActiveSession()) {
        void this.$terminal.destroyPersistentSession()
      }
      this.$terminal.startTerminal(this.termTarget(), this.$settings.getTerminalOptions({
        screenReaderMode: true,
      }), this.resizeEvent)
    }

    // Set focus to the terminal after next render to ensure it's initialized
    requestAnimationFrame(() => {
      this.patchXtermLiveRegion()
      this.activateTerminal()
    })
  }

  public ngAfterViewInit(): void {
    this.visibilityChangeHandler = this.onVisibilityChange.bind(this)
    document.addEventListener('visibilitychange', this.visibilityChangeHandler)

    setTimeout(() => this.patchXtermLiveRegion(), 0)
  }

  private onVisibilityChange(): void {
    // When tab becomes visible, focus this terminal
    if (!document.hidden && this.$terminal.isTerminalReady()) {
      requestAnimationFrame(() => {
        this.patchXtermLiveRegion()
        this.activateTerminal()
      })
    }
  }

  public async canDeactivate(nextUrl?: string): Promise<boolean> {
    // Check if navigation guard allows deactivation
    const guardResult = await this.$navigationGuard.canDeactivate()

    // If guard blocks navigation, return immediately
    if (guardResult === false) {
      return guardResult
    }

    // Get terminal theme - enforces dark mode override
    const terminalTheme = this.$settings.getEffectiveTerminalLightingMode()

    // Check if transition is needed (only when main theme is light AND terminal theme is dark)
    const needsTransition = (
      this.$settings.actualLightingMode === 'light'
      && terminalTheme === 'dark'
    )

    // If no transition needed, navigate immediately
    if (!needsTransition) {
      window.document.querySelector('body').classList.remove('bg-black')
      window.document.querySelector('body').classList.remove('bg-white')
      return Promise.resolve(true)
    }

    // Remove theme-transition class from body
    window.document.querySelector('body').classList.remove('theme-transition')

    // Check if we're navigating to another page with the same terminal theme
    const stayingSameTheme = nextUrl && (
      nextUrl.includes('/platform-tools/terminal')
      || nextUrl.includes('/logs')
    )

    // Otherwise, handle fade-out animation
    return new Promise((resolve) => {
      // Add fade-out class to terminal
      const terminal = this.termTarget()?.nativeElement
      if (terminal) {
        terminal.classList.add('fade-out')
      }

      if (stayingSameTheme) {
        // Just fade out the terminal, keep background the same
        setTimeout(() => {
          resolve(true)
        }, 250)
      } else {
        // Wait for fade-out animation (250ms) and body background transition (250ms)
        setTimeout(() => {
          // Remove body bg color to trigger background transition
          window.document.querySelector('body').classList.remove('bg-black')
          window.document.querySelector('body').classList.remove('bg-white')
        }, 250)

        // Wait for both animations to complete before allowing navigation
        setTimeout(() => {
          resolve(true)
        }, 500)
      }
    })
  }

  public ngOnDestroy(): void {
    if (this.visibilityChangeHandler) {
      document.removeEventListener('visibilitychange', this.visibilityChangeHandler)
      this.visibilityChangeHandler = null
    }

    // Clean up theme-transition class
    window.document.querySelector('body').classList.remove('theme-transition')
    window.document.querySelector('body').classList.remove('light-mode')
    window.document.querySelector('body').classList.remove('bg-black')
    window.document.querySelector('body').classList.remove('bg-white')

    // Use persistence setting to determine behavior
    if (this.$settings.env.terminal?.persistence) {
      // Detach the terminal but keep the session alive
      this.$terminal.detachTerminal()
    } else {
      // Destroy the terminal completely and ensure any persistent session is destroyed
      void this.$terminal.destroyPersistentSession()
    }
  }
}

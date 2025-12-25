import { AfterViewInit, Component, ElementRef, HostListener, inject, OnDestroy, OnInit, viewChild } from '@angular/core'
import { TranslatePipe, TranslateService } from '@ngx-translate/core'
import { Subject } from 'rxjs'

import { SettingsService } from '@/app/core/settings.service'
import { TerminalNavigationGuardService } from '@/app/core/terminal-navigation-guard.service'
import { TerminalService } from '@/app/core/terminal.service'

@Component({
  templateUrl: './terminal.component.html',
  styleUrls: ['./terminal.component.scss'],
  standalone: true,
  imports: [TranslatePipe],
})
export class TerminalComponent implements OnInit, AfterViewInit, OnDestroy {
  private $terminal = inject(TerminalService)
  private $settings = inject(SettingsService)
  private $navigationGuard = inject(TerminalNavigationGuardService)
  private $translate = inject(TranslateService)
  private resizeEvent = new Subject<void>()

  readonly termTarget = viewChild<ElementRef>('terminaloutput')

  @HostListener('window:resize', ['$event'])
  onWindowResize() {
    this.resizeEvent.next(undefined)
  }

  @HostListener('window:beforeunload', ['$event'])
  onBeforeUnload(event: BeforeUnloadEvent) {
    return this.$navigationGuard.handleBeforeUnload(event)
  }

  @HostListener('window:focus', ['$event'])
  onWindowFocus() {
    // Autofocus terminal when user returns to this window
    this.activateTerminal()
  }

  @HostListener('click', ['$event'])
  onClick() {
    // Focus this terminal when clicked
    this.activateTerminal()
  }

  private activateTerminal() {
    // Only focus if this terminal is ready and connected
    if (this.$terminal.isTerminalReady() && this.$terminal.term) {
      // Focus the actual terminal element for better UX
      this.$terminal.term.focus()
    }
  }

  public ngOnInit() {
    // Set page title
    const title = this.$translate.instant('menu.linux.label_terminal')
    this.$settings.setPageTitle(title)

    // Set body bg color
    window.document.querySelector('body').classList.add('bg-black')

    // Add light-mode class for animations (only in light mode)
    if (this.$settings.actualLightingMode === 'light') {
      window.document.querySelector('body').classList.add('light-mode')
      const terminal = this.termTarget()?.nativeElement
      if (terminal) {
        terminal.classList.add('light-mode')
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
      this.$terminal.reconnectTerminal(this.termTarget(), {}, this.resizeEvent)
    } else {
      // If persistence is disabled but there's still an active session, destroy it first
      if (!this.$settings.env.terminal?.persistence && this.$terminal.hasActiveSession()) {
        this.$terminal.destroyPersistentSession()
      }
      this.$terminal.startTerminal(this.termTarget(), {}, this.resizeEvent)
    }

    // Set focus to the terminal after a delay to ensure it's initialized
    setTimeout(() => {
      this.activateTerminal()
    }, 100)
  }

  public ngAfterViewInit() {
    // Listen for visibility changes to focus terminal when tab becomes visible
    document.addEventListener('visibilitychange', this.onVisibilityChange.bind(this))
  }

  private onVisibilityChange() {
    // When tab becomes visible, focus this terminal
    if (!document.hidden && this.$terminal.isTerminalReady()) {
      setTimeout(() => {
        this.activateTerminal()
      }, 100)
    }
  }

  public canDeactivate(nextUrl?: string): Promise<boolean> | boolean {
    // Check if navigation guard allows deactivation
    const guardResult = this.$navigationGuard.canDeactivate()

    // If guard blocks navigation, return immediately
    if (guardResult === false || (guardResult instanceof Promise && guardResult.then)) {
      return guardResult
    }

    // If in dark mode, no animations needed - navigate immediately
    if (this.$settings.actualLightingMode !== 'light') {
      window.document.querySelector('body').classList.remove('bg-black')
      return Promise.resolve(true)
    }

    // Remove light-mode class from body
    window.document.querySelector('body').classList.remove('light-mode')

    // Check if we're navigating to another black-background page
    const stayingBlack = nextUrl && (
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

      if (stayingBlack) {
        // Just fade out the terminal, keep background black
        setTimeout(() => {
          resolve(true)
        }, 250)
      } else {
        // Wait for fade-out animation (250ms) and body background transition (250ms)
        setTimeout(() => {
          // Remove body bg color to trigger background transition
          window.document.querySelector('body').classList.remove('bg-black')
        }, 250)

        // Wait for both animations to complete before allowing navigation
        setTimeout(() => {
          resolve(true)
        }, 500)
      }
    })
  }

  public ngOnDestroy() {
    // Clean up visibility change listener
    document.removeEventListener('visibilitychange', this.onVisibilityChange.bind(this))

    // Clean up light-mode class
    window.document.querySelector('body').classList.remove('light-mode')

    // Use persistence setting to determine behavior
    if (this.$settings.env.terminal?.persistence) {
      // Detach the terminal but keep the session alive
      this.$terminal.detachTerminal()
    } else {
      // Destroy the terminal completely and ensure any persistent session is destroyed
      this.$terminal.destroyPersistentSession()
    }
  }
}

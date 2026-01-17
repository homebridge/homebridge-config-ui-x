import { AfterViewInit, ChangeDetectorRef, Component, ElementRef, HostListener, inject, Input, OnDestroy, OnInit, viewChild } from '@angular/core'
import { TranslatePipe } from '@ngx-translate/core'
import { ITerminalOptions } from '@xterm/xterm'
import { Subject, Subscription } from 'rxjs'

import { SettingsService } from '@/app/core/settings.service'
import { TerminalNavigationGuardService } from '@/app/core/terminal-navigation-guard.service'
import { TerminalService } from '@/app/core/terminal.service'
import { Widget } from '@/app/modules/status/widgets/widgets.interfaces'

@Component({
  templateUrl: './terminal-widget.component.html',
  standalone: true,
  imports: [
    TranslatePipe,
  ],
})
export class TerminalWidgetComponent implements OnInit, AfterViewInit, OnDestroy {
  private $terminal = inject(TerminalService)
  private $settings = inject(SettingsService)
  private $navigationGuard = inject(TerminalNavigationGuardService)
  private $cdr = inject(ChangeDetectorRef)
  private visibilityChangeHandler: (() => void) | null = null
  private terminalSettingsSubscription?: Subscription
  private configureEventSubscription?: Subscription
  private resizeEventSubscription?: Subscription

  readonly widgetContainerElement = viewChild<ElementRef>('widgetcontainer')
  readonly titleElement = viewChild<ElementRef>('terminaltitle')
  readonly termTarget = viewChild<ElementRef>('terminaloutput')

  @Input() widget: Widget
  @Input() resizeEvent: Subject<any>
  @Input() configureEvent: Subject<any>

  public terminalHeight = 200

  public get theme(): 'dark' | 'light' {
    // Always use effective theme to enforce dark mode override
    return this.$settings.getEffectiveTerminalLightingMode()
  }

  @HostListener('window:beforeunload', ['$event'])
  onBeforeUnload(event: BeforeUnloadEvent) {
    // NOTE: This is a safeguard - the status component also handles beforeunload events
    // when terminal widgets are present, so this may not be strictly necessary
    return this.$navigationGuard.handleBeforeUnload(event)
  }

  @HostListener('window:focus', ['$event'])
  onWindowFocus() {
    // Auto-focus terminal when user returns to this window
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
    setTimeout(() => {
      const terminalOptions = this.$settings.getTerminalOptions({
        cursorBlink: false,
      }, true)

      // If terminal is already ready, use reconnectTerminal for proper session management
      if (this.$terminal.isTerminalReady()) {
        this.$terminal.reconnectTerminal(this.termTarget(), terminalOptions, this.resizeEvent)
        return
      }

      // Start or reconnect to the terminal
      if (this.$settings.env.terminal?.persistence && this.$terminal.hasActiveSession()) {
        this.$terminal.reconnectTerminal(this.termTarget(), terminalOptions, this.resizeEvent)
      } else {
        this.$terminal.startTerminal(this.termTarget(), terminalOptions, this.resizeEvent)
      }
    })

    this.resizeEventSubscription = this.resizeEvent.subscribe({
      next: () => {
        this.terminalHeight = this.getTerminalHeight()
      },
    })

    this.configureEventSubscription = this.configureEvent.subscribe({
      next: () => {
        // Widget configuration changes would be handled here if needed
      },
    })

    // Subscribe to global terminal settings changes
    this.terminalSettingsSubscription = this.$settings.terminalSettingsChanged.subscribe({
      next: (settings) => {
        if (!this.$terminal.term) {
          return
        }
        let changed = false
        if (settings.fontSize && this.$terminal.term.options.fontSize !== settings.fontSize) {
          this.$terminal.term.options.fontSize = settings.fontSize
          changed = true
        }
        if (settings.fontWeight && this.$terminal.term.options.fontWeight !== settings.fontWeight) {
          this.$terminal.term.options.fontWeight = settings.fontWeight as ITerminalOptions['fontWeight']
          changed = true
        }
        if (settings.lightingMode !== undefined) {
          const themeOptions = this.$settings.getTerminalThemeOptions(true)
          this.$terminal.term.options.theme = themeOptions.theme
          this.$terminal.term.options.allowTransparency = themeOptions.allowTransparency
          changed = true

          // Trigger change detection for template bindings (background color, etc.)
          this.$cdr.markForCheck()
        }
        if (changed) {
          this.resizeEvent.next(undefined)
          setTimeout(() => {
            this.$terminal.term.scrollToBottom()
          }, 100)
        }
      },
    })
  }

  public ngAfterViewInit() {
    // Auto-focus terminal when component is fully loaded
    setTimeout(() => {
      this.activateTerminal()
    }, 100)

    // Listen for visibility changes to focus terminal when tab becomes visible
    this.visibilityChangeHandler = this.onVisibilityChange.bind(this)
    document.addEventListener('visibilitychange', this.visibilityChangeHandler)
  }

  private onVisibilityChange() {
    // When tab becomes visible, focus this terminal
    if (!document.hidden && this.$terminal.isTerminalReady()) {
      // Only focus if this terminal widget is actually visible on screen
      if (this.isTerminalWidgetVisible()) {
        setTimeout(() => {
          this.activateTerminal()
        }, 100)
      }
    }
  }

  private isTerminalWidgetVisible(): boolean {
    const element = this.widgetContainerElement()?.nativeElement
    if (!element) {
      return false
    }

    // Check if the element is visible (not hidden by display: none, etc.)
    const rect = element.getBoundingClientRect()
    return rect.width > 0 && rect.height > 0
  }

  public ngOnDestroy() {
    // Clean up subscriptions
    this.terminalSettingsSubscription?.unsubscribe()
    this.configureEventSubscription?.unsubscribe()
    this.resizeEventSubscription?.unsubscribe()

    // Clean up visibility change listener
    if (this.visibilityChangeHandler) {
      document.removeEventListener('visibilitychange', this.visibilityChangeHandler)
      this.visibilityChangeHandler = null
    }

    // Use persistence setting to determine behavior
    // NOTE: This is essential for proper terminal lifecycle management
    if (this.$settings.env.terminal?.persistence) {
      // Detach the terminal but keep the session alive
      this.$terminal.detachTerminal()
    } else {
      // Destroy the terminal completely
      this.$terminal.destroyTerminal()
    }
  }

  private getTerminalHeight(): number {
    const widgetContainerHeight = (this.widgetContainerElement().nativeElement as HTMLElement).offsetHeight
    const titleHeight = (this.titleElement().nativeElement as HTMLElement).offsetHeight
    return widgetContainerHeight - titleHeight
  }
}

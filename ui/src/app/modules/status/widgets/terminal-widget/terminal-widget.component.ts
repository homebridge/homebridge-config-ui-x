import { NgClass, NgStyle } from '@angular/common'
import { AfterViewInit, Component, ElementRef, HostListener, inject, Input, OnDestroy, OnInit, viewChild } from '@angular/core'
import { TranslatePipe } from '@ngx-translate/core'
import { ITerminalOptions } from '@xterm/xterm'
import { Subject } from 'rxjs'

import { SettingsService } from '@/app/core/settings.service'
import { TerminalNavigationGuardService } from '@/app/core/terminal-navigation-guard.service'
import { TerminalService } from '@/app/core/terminal.service'

@Component({
  templateUrl: './terminal-widget.component.html',
  standalone: true,
  imports: [
    NgClass,
    NgStyle,
    TranslatePipe,
  ],
})
export class TerminalWidgetComponent implements OnInit, AfterViewInit, OnDestroy {
  private $terminal = inject(TerminalService)
  private $settings = inject(SettingsService)
  private $navigationGuard = inject(TerminalNavigationGuardService)
  private fontSize = 15
  private fontWeight: ITerminalOptions['fontWeight'] = '400'
  private visibilityChangeHandler: (() => void) | null = null

  readonly widgetContainerElement = viewChild<ElementRef>('widgetcontainer')
  readonly titleElement = viewChild<ElementRef>('terminaltitle')
  readonly termTarget = viewChild<ElementRef>('terminaloutput')

  @Input() widget: any
  @Input() resizeEvent: Subject<any>
  @Input() configureEvent: Subject<any>

  public terminalHeight = 200
  public theme: 'dark' | 'light' = 'dark'

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
    this.fontSize = this.widget.fontSize || 15
    this.fontWeight = this.widget.fontWeight || 400
    if (this.$settings.actualLightingMode === 'dark') {
      this.widget.theme = 'dark'
    }
    this.theme = this.widget.theme || 'dark'

    setTimeout(() => {
      const terminalOptions = {
        cursorBlink: false,
        theme: this.theme !== 'light'
          ? {
              background: '#2b2b2b',
            }
          : {
              background: '#00000000',
              foreground: '#2b2b2b',
              cursor: '#d2d2d2',
              selectionBackground: '#d2d2d2',
            },
        allowTransparency: this.theme === 'light',
        allowProposedApi: true,
        fontSize: this.fontSize,
        fontWeight: this.fontWeight,
      }

      // If terminal is already ready, use reconnectTerminal for proper session management
      if (this.$terminal.isTerminalReady()) {
        this.$terminal.reconnectTerminal(this.termTarget(), terminalOptions, this.resizeEvent)
        return
      }

      // Start or reconnect to the terminal
      if (this.$settings.terminalPersistence && this.$terminal.hasActiveSession()) {
        this.$terminal.reconnectTerminal(this.termTarget(), terminalOptions, this.resizeEvent)
      } else {
        this.$terminal.startTerminal(this.termTarget(), terminalOptions, this.resizeEvent)
      }
    })

    this.resizeEvent.subscribe({
      next: () => {
        this.terminalHeight = this.getTerminalHeight()
      },
    })

    this.configureEvent.subscribe({
      next: () => {
        let changed = false
        if (this.widget.fontSize !== this.fontSize) {
          this.fontSize = this.widget.fontSize
          this.$terminal.term.options.fontSize = this.widget.fontSize
          changed = true
        }
        if (this.widget.fontWeight !== this.fontWeight) {
          this.fontWeight = this.widget.fontWeight
          this.$terminal.term.options.fontWeight = this.widget.fontWeight
          changed = true
        }
        if (this.widget.theme !== this.theme) {
          this.theme = this.widget.theme
          this.$terminal.term.options.theme = this.theme !== 'light'
            ? {
                background: '#2b2b2b',
              }
            : {
                background: 'transparent',
                foreground: '#2b2b2b',
                cursor: '#d2d2d2',
                selectionBackground: '#d2d2d2',
              }
          this.$terminal.term.options.allowTransparency = true
          this.$terminal.term.options.allowProposedApi = true
          changed = true
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
    // Clean up visibility change listener
    if (this.visibilityChangeHandler) {
      document.removeEventListener('visibilitychange', this.visibilityChangeHandler)
      this.visibilityChangeHandler = null
    }

    // Use persistence setting to determine behavior
    // NOTE: This is essential for proper terminal lifecycle management
    if (this.$settings.terminalPersistence) {
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

import {
  Component,
  DestroyRef,
  ElementRef,
  HostListener,
  inject,
  input,
  OnDestroy,
  OnInit,
  signal,
  viewChild,
} from '@angular/core'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import { TranslatePipe } from '@ngx-translate/core'
import { ITerminalOptions } from '@xterm/xterm'
import { Subject } from 'rxjs'

import { SettingsService } from '@/app/core/ui/settings.service'
import { TerminalNavigationGuardService } from '@/app/core/utilities/terminal-navigation-guard.service'
import { TerminalService } from '@/app/core/utilities/terminal.service'
import { Widget } from '@/app/modules/status/widgets/widgets.interfaces'

@Component({
  templateUrl: './terminal-widget.component.html',
  standalone: true,
  imports: [
    TranslatePipe,
  ],
})
export class TerminalWidgetComponent implements OnInit, OnDestroy {
  // Injected dependencies
  private destroyRef = inject(DestroyRef)
  private $terminal = inject(TerminalService)
  private $settings = inject(SettingsService)
  private $navigationGuard = inject(TerminalNavigationGuardService)

  // Signals
  widget = input.required<Widget>()
  readonly widgetContainerElement = viewChild<ElementRef>('widgetcontainer')
  readonly titleElement = viewChild<ElementRef>('terminaltitle')
  readonly termTarget = viewChild<ElementRef>('terminaloutput')
  public terminalHeight = signal<number>(200)
  public theme = signal<'dark' | 'light'>('dark')

  // Other properties
  private fontSize = 15
  private fontWeight: ITerminalOptions['fontWeight'] = '400'
  private visibilityChangeHandler: (() => void) | null = null
  resizeEvent!: Subject<void> // Set directly by ComponentFactoryResolver
  configureEvent!: Subject<void> // Set directly by ComponentFactoryResolver

  @HostListener('window:beforeunload', ['$event'])
  onBeforeUnload(event: BeforeUnloadEvent): void {
    // NOTE: This is a safeguard - the status component also handles beforeunload events
    // when terminal widgets are present, so this may not be strictly necessary
    this.$navigationGuard.handleBeforeUnload(event)
  }

  @HostListener('window:focus')
  onWindowFocus(): void {
    // Autofocus terminal when user returns to this window
    this.activateTerminal()
  }

  @HostListener('click')
  onClick(): void {
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

  public ngOnInit(): void {
    this.fontSize = this.widget().fontSize || 15
    this.fontWeight = Number.parseInt(this.widget().fontWeight || '400', 10)
    if (this.$settings.actualLightingMode === 'dark') {
      this.widget().theme = 'dark'
    }
    this.theme.set(this.widget().theme || 'dark')

    // Defer terminal initialization to avoid NG0100
    queueMicrotask(() => {
      const terminalOptions = {
        cursorBlink: false,
        theme: this.theme() !== 'light'
          ? {
              background: '#2b2b2b',
            }
          : {
              background: '#00000000',
              foreground: '#2b2b2b',
              cursor: '#d2d2d2',
              selectionBackground: '#d2d2d2',
            },
        allowTransparency: this.theme() === 'light',
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
      if (this.$settings.env.terminal?.persistence && this.$terminal.hasActiveSession()) {
        this.$terminal.reconnectTerminal(this.termTarget(), terminalOptions, this.resizeEvent)
      } else {
        this.$terminal.startTerminal(this.termTarget(), terminalOptions, this.resizeEvent)
      }

      // Autofocus terminal when component is fully loaded
      setTimeout(() => {
        this.activateTerminal()
      }, 100)
    })

    this.resizeEvent.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => {
        this.terminalHeight.set(this.getTerminalHeight())
      },
    })

    this.configureEvent.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => {
        let changed = false
        if (this.widget().fontSize !== this.fontSize) {
          this.fontSize = this.widget().fontSize
          this.$terminal.term.options.fontSize = this.widget().fontSize
          changed = true
        }
        if (this.widget().fontWeight !== this.fontWeight) {
          this.fontWeight = Number.parseInt(this.widget().fontWeight, 10)
          this.$terminal.term.options.fontWeight = Number.parseInt(this.widget().fontWeight, 10)
          changed = true
        }
        if (this.widget().theme !== this.theme()) {
          this.theme.set(this.widget().theme)
          this.$terminal.term.options.theme = this.theme() !== 'light'
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

    // Listen for visibility changes to focus terminal when tab becomes visible
    this.visibilityChangeHandler = this.onVisibilityChange.bind(this)
    document.addEventListener('visibilitychange', this.visibilityChangeHandler)
  }

  private onVisibilityChange(): void {
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

  public ngOnDestroy(): void {
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

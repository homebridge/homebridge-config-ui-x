import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  DestroyRef,
  ElementRef,
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
  selector: 'app-terminal-widget',
  imports: [
    TranslatePipe,
  ],
  standalone: true,
  templateUrl: './terminal-widget.component.html',
  styleUrl: './terminal-widget.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(window:beforeunload)': 'onBeforeUnload($event)',
    '(window:focus)': 'onWindowFocus()',
    '(click)': 'onClick()',
    '(touchstart)': 'onTouchStart($event)',
    '(touchend)': 'onTouchEnd($event)',
  },
})
export class TerminalWidgetComponent implements OnInit, OnDestroy {
  // Injected dependencies
  private destroyRef = inject(DestroyRef)
  private $terminal = inject(TerminalService)
  private $settings = inject(SettingsService)
  private $navigationGuard = inject(TerminalNavigationGuardService)
  private $cdr = inject(ChangeDetectorRef)

  // Signals
  readonly widget = input.required<Widget>()
  readonly widgetContainerElement = viewChild<ElementRef>('widgetcontainer')
  readonly titleElement = viewChild<ElementRef>('terminaltitle')
  readonly termTarget = viewChild<ElementRef>('terminaloutput')
  public readonly terminalHeight = signal<number>(200)
  public readonly theme = signal<'dark' | 'light'>('dark')

  // Other properties
  private visibilityChangeHandler: (() => void) | null = null
  resizeEvent!: Subject<void> // Set directly by ComponentFactoryResolver
  configureEvent!: Subject<void> // Set directly by ComponentFactoryResolver

  onBeforeUnload(event: BeforeUnloadEvent): void {
    // NOTE: This is a safeguard - the status component also handles beforeunload events
    // when terminal widgets are present, so this may not be strictly necessary
    this.$navigationGuard.handleBeforeUnload(event)
  }

  onWindowFocus(): void {
    this.$terminal.activateTerminal()
  }

  onClick(): void {
    this.$terminal.activateTerminal()
  }

  onTouchStart(event: TouchEvent): void {
    this.$terminal.onTouchStart(event)
  }

  onTouchEnd(event: TouchEvent): void {
    this.$terminal.onTouchEnd(event)
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
    // Use effective theme to enforce dark mode override when needed
    this.theme.set(this.$settings.getEffectiveTerminalLightingMode())

    // Defer terminal initialization to avoid NG0100
    queueMicrotask(() => {
      // Use global terminal settings from settings service
      const terminalOptions = this.$settings.getTerminalOptions({
        cursorBlink: false,
      }, true)

      // If terminal is already ready, use reconnectTerminal for proper session management
      if (this.$terminal.isTerminalReady()) {
        this.$terminal.reconnectTerminal(this.termTarget()!, terminalOptions, this.resizeEvent)
        return
      }

      // Start or reconnect to the terminal
      if (this.$settings.env.terminal?.persistence && this.$terminal.hasActiveSession()) {
        this.$terminal.reconnectTerminal(this.termTarget()!, terminalOptions, this.resizeEvent)
      } else {
        this.$terminal.startTerminal(this.termTarget()!, terminalOptions, this.resizeEvent)
      }

      // Autofocus terminal when component is fully loaded
      setTimeout(() => {
        this.patchXtermLiveRegion()
        this.$terminal.activateTerminal()
      }, 100)
    })

    this.resizeEvent.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => {
        this.terminalHeight.set(this.getTerminalHeight())
      },
    })

    // Note: Widget-specific configuration (fontSize, fontWeight, theme) is not implemented
    // Only global terminal settings via terminalSettingsSubscription are functional
    this.configureEvent.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      // Reserved for future widget-specific configuration if needed
    })

    // Subscribe to global terminal settings changes
    this.$settings.terminalSettingsChanged.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
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
          this.patchXtermLiveRegion()
          this.$terminal.activateTerminal()
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
    const widgetContainerHeight = (this.widgetContainerElement()!.nativeElement as HTMLElement).offsetHeight
    const titleHeight = (this.titleElement()!.nativeElement as HTMLElement).offsetHeight
    return widgetContainerHeight - titleHeight
  }
}

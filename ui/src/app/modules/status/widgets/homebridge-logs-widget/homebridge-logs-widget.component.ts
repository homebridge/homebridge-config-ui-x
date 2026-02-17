import { ChangeDetectionStrategy, ChangeDetectorRef, Component, DestroyRef, ElementRef, inject, input, OnDestroy, OnInit, signal, viewChild } from '@angular/core'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import { TranslatePipe } from '@ngx-translate/core'
import { ITerminalOptions } from '@xterm/xterm'
import { Subject, Subscription } from 'rxjs'

import { SettingsService } from '@/app/core/ui/settings.service'
import { LogService } from '@/app/core/utilities/log.service'
import { Widget } from '@/app/modules/status/widgets/widgets.interfaces'

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './homebridge-logs-widget.component.html',
  standalone: true,
  imports: [
    TranslatePipe,
  ],
})
export class HomebridgeLogsWidgetComponent implements OnInit, OnDestroy {
  // Injected dependencies
  private destroyRef = inject(DestroyRef)
  private $log = inject(LogService)
  private $settings = inject(SettingsService)
  private $cdr = inject(ChangeDetectorRef)

  // Signals
  widget = input.required<Widget>()
  readonly widgetContainerElement = viewChild<ElementRef>('widgetcontainer')
  readonly titleElement = viewChild<ElementRef>('terminaltitle')
  readonly termTarget = viewChild<ElementRef>('logoutput')
  public terminalHeight = signal<number>(200)
  public theme = signal<'dark' | 'light'>('dark')

  // Other properties
  private initialized = false
  resizeEvent!: Subject<void> // Set directly by ComponentFactoryResolver
  configureEvent!: Subject<void> // Set directly by ComponentFactoryResolver
  private terminalSettingsSubscription?: Subscription

  public ngOnInit(): void {
    // Use effective theme to enforce dark mode override when needed
    this.theme.set(this.$settings.getEffectiveTerminalLightingMode())
    setTimeout(() => {
      // Use global terminal settings from settings service
      this.$log.startTerminal(this.termTarget(), this.$settings.getTerminalOptions({
        cursorBlink: false,
      }, true), this.resizeEvent)

      // Mark as initialized after terminal setup completes
      this.initialized = true

      // Trigger initial resize to calculate height and fit terminal
      setTimeout(() => {
        this.resizeEvent.next()
      }, 100)
    })

    this.resizeEvent.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      // Skip resize updates until component is fully initialized
      if (!this.initialized) {
        return
      }
      this.terminalHeight.set(this.getTerminalHeight())
    })

    // Note: Widget-specific configuration (fontSize, fontWeight, theme) is not implemented
    // Only global terminal settings via terminalSettingsSubscription are functional
    this.configureEvent.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      // Reserved for future widget-specific configuration if needed
    })

    // Subscribe to global terminal settings changes (Angular 20 feature)
    this.terminalSettingsSubscription = this.$settings.terminalSettingsChanged.subscribe({
      next: (settings) => {
        if (!this.$log.term) {
          return
        }
        let changed = false
        if (settings.fontSize && this.$log.term.options.fontSize !== settings.fontSize) {
          this.$log.term.options.fontSize = settings.fontSize
          changed = true
        }
        if (settings.fontWeight && this.$log.term.options.fontWeight !== settings.fontWeight) {
          this.$log.term.options.fontWeight = settings.fontWeight as ITerminalOptions['fontWeight']
          changed = true
        }
        if (settings.lightingMode !== undefined) {
          const themeOptions = this.$settings.getTerminalThemeOptions(true)
          this.$log.term.options.theme = themeOptions.theme
          this.$log.term.options.allowTransparency = themeOptions.allowTransparency
          changed = true

          // Trigger change detection for template bindings (background color, etc.)
          this.$cdr.markForCheck()
        }
        if (changed) {
          this.resizeEvent.next(undefined)
          setTimeout(() => {
            this.$log.term.scrollToBottom()
          }, 100)
        }
      },
    })
  }

  public ngOnDestroy(): void {
    this.terminalSettingsSubscription?.unsubscribe()
    this.$log.destroyTerminal()
  }

  private getTerminalHeight(): number {
    const widgetContainerHeight = (this.widgetContainerElement().nativeElement as HTMLElement).offsetHeight
    const titleHeight = (this.titleElement().nativeElement as HTMLElement).offsetHeight
    return widgetContainerHeight - titleHeight
  }
}

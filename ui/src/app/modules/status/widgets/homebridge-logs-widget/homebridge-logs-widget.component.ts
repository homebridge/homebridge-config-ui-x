import { ChangeDetectorRef, Component, ElementRef, inject, Input, OnDestroy, OnInit, viewChild } from '@angular/core'
import { TranslatePipe } from '@ngx-translate/core'
import { ITerminalOptions } from '@xterm/xterm'
import { Subject, Subscription } from 'rxjs'

import { LogService } from '@/app/core/log.service'
import { SettingsService } from '@/app/core/settings.service'
import { Widget } from '@/app/modules/status/widgets/widgets.interfaces'

@Component({
  templateUrl: './homebridge-logs-widget.component.html',
  standalone: true,
  imports: [
    TranslatePipe,
  ],
})
export class HomebridgeLogsWidgetComponent implements OnInit, OnDestroy {
  private $log = inject(LogService)
  private $settings = inject(SettingsService)
  private $cdr = inject(ChangeDetectorRef)
  private terminalSettingsSubscription?: Subscription
  private configureEventSubscription?: Subscription
  private resizeEventSubscription?: Subscription

  readonly widgetContainerElement = viewChild<ElementRef>('widgetcontainer')
  readonly titleElement = viewChild<ElementRef>('terminaltitle')
  readonly termTarget = viewChild<ElementRef>('logoutput')

  @Input() widget: Widget
  @Input() resizeEvent: Subject<any>
  @Input() configureEvent: Subject<any>

  public terminalHeight = 200

  public get theme(): 'dark' | 'light' {
    // Always use effective theme to enforce dark mode override
    return this.$settings.getEffectiveTerminalLightingMode()
  }

  public ngOnInit() {
    setTimeout(() => {
      this.$log.startTerminal(this.termTarget(), this.$settings.getTerminalOptions({
        cursorBlink: false,
      }, true), this.resizeEvent)
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

  public ngOnDestroy() {
    this.terminalSettingsSubscription?.unsubscribe()
    this.configureEventSubscription?.unsubscribe()
    this.resizeEventSubscription?.unsubscribe()
    this.$log.destroyTerminal()
  }

  private getTerminalHeight(): number {
    const widgetContainerHeight = (this.widgetContainerElement().nativeElement as HTMLElement).offsetHeight
    const titleHeight = (this.titleElement().nativeElement as HTMLElement).offsetHeight
    return widgetContainerHeight - titleHeight
  }
}

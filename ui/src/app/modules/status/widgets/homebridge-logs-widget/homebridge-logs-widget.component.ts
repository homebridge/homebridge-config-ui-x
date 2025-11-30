import { Component, DestroyRef, ElementRef, inject, input, OnDestroy, OnInit, signal, viewChild } from '@angular/core'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import { TranslatePipe } from '@ngx-translate/core'
import { ITerminalOptions } from '@xterm/xterm'
import { Subject } from 'rxjs'

import { SettingsService } from '@/app/core/ui/settings.service'
import { LogService } from '@/app/core/utilities/log.service'
import { Widget } from '@/app/modules/status/widgets/widgets.interfaces'

@Component({
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

  // Signals
  widget = input.required<Widget>()
  readonly widgetContainerElement = viewChild<ElementRef>('widgetcontainer')
  readonly titleElement = viewChild<ElementRef>('terminaltitle')
  readonly termTarget = viewChild<ElementRef>('logoutput')
  public terminalHeight = signal<number>(200)
  public theme = signal<'dark' | 'light'>('dark')

  // Other properties
  private fontSize = 15
  private fontWeight: ITerminalOptions['fontWeight'] = '400'
  private initialized = false
  resizeEvent!: Subject<void> // Set directly by ComponentFactoryResolver
  configureEvent!: Subject<void> // Set directly by ComponentFactoryResolver

  public ngOnInit(): void {
    this.fontSize = this.widget().fontSize || 15
    this.fontWeight = Number.parseInt(this.widget().fontWeight || '400')
    if (this.$settings.actualLightingMode === 'dark') {
      this.widget().theme = 'dark'
    }
    this.theme.set(this.widget().theme || 'dark')

    setTimeout(() => {
      this.$log.startTerminal(this.termTarget(), {
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
      }, this.resizeEvent)

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

    this.configureEvent.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      let changed = false
      if (this.widget().fontSize !== this.fontSize) {
        this.fontSize = this.widget().fontSize
        this.$log.term.options.fontSize = this.widget().fontSize
        changed = true
      }
      if (this.widget().fontWeight !== this.fontWeight) {
        this.fontWeight = Number.parseInt(this.widget().fontWeight, 10)
        this.$log.term.options.fontWeight = Number.parseInt(this.widget().fontWeight, 10)
        changed = true
      }
      if (this.widget().theme !== this.theme()) {
        this.theme.set(this.widget().theme)
        this.$log.term.options.theme = this.theme() !== 'light'
          ? {
              background: '#2b2b2b',
            }
          : {
              background: '#00000000',
              foreground: '#2b2b2b',
              cursor: '#d2d2d2',
              selectionBackground: '#d2d2d2',
            }
        this.$log.term.options.allowTransparency = true
        this.$log.term.options.allowProposedApi = true
        changed = true
      }

      if (changed) {
        this.resizeEvent.next(undefined)
        setTimeout(() => {
          this.$log.term.scrollToBottom()
        }, 100)
      }
    })
  }

  public ngOnDestroy(): void {
    this.$log.destroyTerminal()
  }

  private getTerminalHeight(): number {
    const widgetContainerHeight = (this.widgetContainerElement().nativeElement as HTMLElement).offsetHeight
    const titleHeight = (this.titleElement().nativeElement as HTMLElement).offsetHeight
    return widgetContainerHeight - titleHeight
  }
}

import { NgClass, NgStyle } from '@angular/common'
import { Component, ElementRef, inject, Input, OnDestroy, OnInit, viewChild } from '@angular/core'
import { TranslatePipe } from '@ngx-translate/core'
import { ITerminalOptions } from '@xterm/xterm'
import { Subject } from 'rxjs'

import { LogService } from '@/app/core/log.service'
import { SettingsService } from '@/app/core/settings.service'
import { Widget } from '@/app/modules/status/widgets/widgets.interfaces'

@Component({
  templateUrl: './homebridge-logs-widget.component.html',
  standalone: true,
  imports: [
    NgClass,
    NgStyle,
    TranslatePipe,
  ],
})
export class HomebridgeLogsWidgetComponent implements OnInit, OnDestroy {
  private $log = inject(LogService)
  private $settings = inject(SettingsService)
  private fontSize = 15
  private fontWeight: ITerminalOptions['fontWeight'] = '400'

  readonly widgetContainerElement = viewChild<ElementRef>('widgetcontainer')
  readonly titleElement = viewChild<ElementRef>('terminaltitle')
  readonly termTarget = viewChild<ElementRef>('logoutput')

  @Input() widget: Widget
  @Input() resizeEvent: Subject<any>
  @Input() configureEvent: Subject<any>

  public terminalHeight = 200
  public theme: 'dark' | 'light' = 'dark'
  public isExpanded = false

  public contentId = ''

  public ngOnInit() {
    this.contentId = `logs-content-${globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2)}`
    this.fontSize = this.widget.fontSize || 15
    this.fontWeight = Number.parseInt(this.widget.fontWeight || '400')
    if (this.$settings.actualLightingMode === 'dark') {
      this.widget.theme = 'dark'
    }
    this.theme = this.widget.theme || 'dark'

    setTimeout(() => {
      this.$log.startTerminal(this.termTarget(), {
        cursorBlink: false,
        screenReaderMode: true,
        disableStdin: true,
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
      }, this.resizeEvent)

      // Hide screen reader elements except the list
      setTimeout(() => {
        const logContainer = this.termTarget()?.nativeElement
        if (logContainer) {
          // Hide the textarea input
          const textarea = logContainer.querySelector('textarea')
          if (textarea) {
            textarea.setAttribute('aria-hidden', 'true')
            textarea.setAttribute('tabindex', '-1')
          }
          
          // Hide the live region that duplicates all text
          const liveRegion = logContainer.querySelector('[aria-live]')
          if (liveRegion && !liveRegion.hasAttribute('role')) {
            liveRegion.setAttribute('aria-hidden', 'true')
          }
          
          // Hide any standalone text content that's not in the list
          const screenReaderDiv = logContainer.querySelector('.xterm-accessibility')
          if (screenReaderDiv) {
            Array.from(screenReaderDiv.children).forEach((child: HTMLElement) => {
              if (child.tagName !== 'UL' && !child.hasAttribute('role')) {
                child.setAttribute('aria-hidden', 'true')
              }
            })
          }
        }
      }, 100)
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
          this.$log.term.options.fontSize = this.widget.fontSize
          changed = true
        }
        if (this.widget.fontWeight !== this.fontWeight) {
          this.fontWeight = Number.parseInt(this.widget.fontWeight, 10)
          this.$log.term.options.fontWeight = Number.parseInt(this.widget.fontWeight, 10)
          changed = true
        }
        if (this.widget.theme !== this.theme) {
          this.theme = this.widget.theme
          this.$log.term.options.theme = this.theme !== 'light'
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
      },
    })
  }

  public ngOnDestroy() {
    this.$log.destroyTerminal()
  }

  public toggleExpanded(event: Event) {
    // Prevent drag handler from interfering
    event.stopPropagation()
    this.isExpanded = !this.isExpanded
    
    // Trigger resize when expanding to ensure terminal renders properly
    if (this.isExpanded) {
      setTimeout(() => {
        this.resizeEvent.next(undefined)
      }, 350) // Wait for animation to complete
    }
  }

  private getTerminalHeight(): number {
    const widgetContainerHeight = (this.widgetContainerElement().nativeElement as HTMLElement).offsetHeight
    const titleHeight = (this.titleElement().nativeElement as HTMLElement).offsetHeight
    return widgetContainerHeight - titleHeight
  }
}

import { NgClass, NgStyle } from '@angular/common'
import { AfterViewInit, Component, ElementRef, HostListener, inject, Input, OnDestroy, OnInit, viewChild } from '@angular/core'
import { TranslatePipe } from '@ngx-translate/core'
import { ITerminalOptions } from '@xterm/xterm'
import { Subject } from 'rxjs'

import { SettingsService } from '@/app/core/settings.service'
import { TerminalNavigationGuardService } from '@/app/core/terminal-navigation-guard.service'
import { TerminalService } from '@/app/core/terminal.service'
import { Widget } from '@/app/modules/status/widgets/widgets.interfaces'

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

  @Input() widget: Widget
  @Input() resizeEvent: Subject<any>
  @Input() configureEvent: Subject<any>

  public terminalHeight = 200
  public theme: 'dark' | 'light' = 'dark'

  public srExpanded = false
  public contentId = ''

  @HostListener('window:beforeunload', ['$event'])
  onBeforeUnload(event: BeforeUnloadEvent) {
    return this.$navigationGuard.handleBeforeUnload(event)
  }

  @HostListener('window:focus', ['$event'])
  onWindowFocus() {
    this.activateTerminal()
  }

  @HostListener('click', ['$event'])
  onClick() {
    this.activateTerminal()
  }

  @HostListener('window:pageshow')
  onPageShow() {
    setTimeout(() => {
      this.applyTerminalA11yState()
      this.patchXtermLiveRegion()
      this.kickFocusOutOfCollapsedTerminal()
    }, 0)
  }

  private activateTerminal() {
    if (!this.srExpanded) {
      return
    }
    if (this.$terminal.isTerminalReady() && this.$terminal.term) {
      this.$terminal.term.focus()
    }
  }

  public toggleSrExpanded(event: Event) {
    event.stopPropagation()
    this.srExpanded = !this.srExpanded

    setTimeout(() => {
      this.applyTerminalA11yState()
      this.patchXtermLiveRegion()

      if (this.srExpanded) {
        this.resizeEvent.next(undefined)
        this.activateTerminal()
      } else {
        this.kickFocusOutOfCollapsedTerminal()
      }
    }, 0)
  }

  private applyTerminalA11yState() {
    const host = this.termTarget()?.nativeElement as HTMLElement | undefined
    if (!host) {
      return
    }

    const ta = host.querySelector('textarea') as HTMLTextAreaElement | null
    if (!ta) {
      return
    }

    if (this.srExpanded) {
      ta.disabled = false
      ta.removeAttribute('aria-hidden')
      ta.removeAttribute('tabindex')
    } else {
      ta.disabled = true
      ta.setAttribute('aria-hidden', 'true')
      ta.setAttribute('tabindex', '-1')
      if (document.activeElement === ta) {
        ta.blur()
      }
    }
  }

  private patchXtermLiveRegion() {
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

  private kickFocusOutOfCollapsedTerminal() {
    if (this.srExpanded) {
      return
    }

    const host = this.termTarget()?.nativeElement as HTMLElement | undefined
    if (!host) {
      return
    }

    if (!host.contains(document.activeElement)) {
      return
    }

    const title = this.titleElement()?.nativeElement as HTMLElement | undefined
    const btn = title?.querySelector('button') as HTMLElement | null
    btn?.focus()
  }

  public ngOnInit() {
    this.contentId = `terminal-content-${globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2)}`
    this.fontSize = this.widget.fontSize || 15
    this.fontWeight = Number.parseInt(this.widget.fontWeight || '400', 10)

    if (this.$settings.actualLightingMode === 'dark') {
      this.widget.theme = 'dark'
    }
    this.theme = this.widget.theme || 'dark'

    setTimeout(() => {
      const terminalOptions: ITerminalOptions = {
        cursorBlink: false,
        screenReaderMode: true,
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

      if (this.$terminal.isTerminalReady()) {
        this.$terminal.reconnectTerminal(this.termTarget(), terminalOptions, this.resizeEvent)
        setTimeout(() => {
          this.applyTerminalA11yState()
          this.patchXtermLiveRegion()
        }, 0)
        return
      }

      if (this.$settings.env.terminal?.persistence && this.$terminal.hasActiveSession()) {
        this.$terminal.reconnectTerminal(this.termTarget(), terminalOptions, this.resizeEvent)
      } else {
        this.$terminal.startTerminal(this.termTarget(), terminalOptions, this.resizeEvent)
      }

      setTimeout(() => {
        this.applyTerminalA11yState()
        this.patchXtermLiveRegion()
      }, 0)
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
          this.fontWeight = Number.parseInt(this.widget.fontWeight, 10)
          this.$terminal.term.options.fontWeight = Number.parseInt(this.widget.fontWeight, 10)
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
            this.applyTerminalA11yState()
            this.patchXtermLiveRegion()
          }, 100)
        }
      },
    })
  }

  public ngAfterViewInit() {
    setTimeout(() => {
      this.applyTerminalA11yState()
      this.patchXtermLiveRegion()
      this.kickFocusOutOfCollapsedTerminal()
    }, 0)

    this.visibilityChangeHandler = this.onVisibilityChange.bind(this)
    document.addEventListener('visibilitychange', this.visibilityChangeHandler)
  }

  private onVisibilityChange() {
    if (!document.hidden && this.$terminal.isTerminalReady()) {
      if (this.isTerminalWidgetVisible()) {
        setTimeout(() => {
          this.applyTerminalA11yState()
          this.patchXtermLiveRegion()
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

    const rect = element.getBoundingClientRect()
    return rect.width > 0 && rect.height > 0
  }

  public ngOnDestroy() {
    if (this.visibilityChangeHandler) {
      document.removeEventListener('visibilitychange', this.visibilityChangeHandler)
      this.visibilityChangeHandler = null
    }

    if (this.$settings.env.terminal?.persistence) {
      this.$terminal.detachTerminal()
    } else {
      this.$terminal.destroyTerminal()
    }
  }

  private getTerminalHeight(): number {
    const widgetContainerHeight = (this.widgetContainerElement().nativeElement as HTMLElement).offsetHeight
    const titleHeight = (this.titleElement().nativeElement as HTMLElement).offsetHeight
    return widgetContainerHeight - titleHeight
  }
}

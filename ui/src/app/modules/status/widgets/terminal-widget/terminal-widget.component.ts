import { TerminalService } from '@/app/core/terminal.service'
import {
  Component,
  ElementRef,
  Input,
  OnDestroy,
  OnInit,
  ViewChild,
} from '@angular/core'
import { Subject } from 'rxjs'
import { ITerminalOptions } from 'xterm'

@Component({
  templateUrl: './terminal-widget.component.html',
})
export class TerminalWidgetComponent implements OnInit, OnDestroy {
  @ViewChild('widgetcontainer', { static: true }) widgetContainerElement: ElementRef
  @ViewChild('terminaltitle', { static: true }) titleElement: ElementRef
  @ViewChild('terminaloutput', { static: true }) termTarget: ElementRef

  @Input() widget: any
  @Input() resizeEvent: Subject<any>
  @Input() configureEvent: Subject<any>

  public terminalHeight = 200

  private fontSize = 15
  private fontWeight: ITerminalOptions['fontWeight'] = '400'

  constructor(
    private $terminal: TerminalService,
  ) {}

  ngOnInit() {
    this.fontSize = this.widget.fontSize || 15
    this.fontWeight = this.widget.fontWeight || 400

    setTimeout(() => {
      this.$terminal.startTerminal(this.termTarget, {
        cursorBlink: false,
        theme: {
          background: '#2b2b2b',
        },
        fontSize: this.fontSize,
        fontWeight: this.fontWeight,
      }, this.resizeEvent)
    })

    this.resizeEvent.subscribe({
      next: () => {
        this.terminalHeight = this.getTerminalHeight()
      },
    })

    this.configureEvent.subscribe({
      next: () => {
        if (this.widget.fontSize !== this.fontSize || this.widget.fontWeight !== this.fontWeight) {
          this.fontSize = this.widget.fontSize
          this.fontWeight = this.widget.fontWeight
          this.$terminal.term.options.fontSize = this.widget.fontSize
          this.$terminal.term.options.fontWeight = this.widget.fontWeight
          this.resizeEvent.next(undefined)
          setTimeout(() => {
            this.$terminal.term.scrollToBottom()
          }, 100)
        }
      },
    })
  }

  getTerminalHeight(): number {
    const widgetContainerHeight = (this.widgetContainerElement.nativeElement as HTMLElement).offsetHeight
    const titleHeight = (this.titleElement.nativeElement as HTMLElement).offsetHeight
    return widgetContainerHeight - titleHeight
  }

  ngOnDestroy() {
    this.$terminal.destroyTerminal()
  }
}

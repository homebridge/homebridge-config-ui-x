import { TerminalService } from '@/app/core/terminal.service'
import {
  Component,
  ElementRef,
  HostListener,
  OnDestroy,
  OnInit,
  ViewChild,
} from '@angular/core'
import { Subject } from 'rxjs'

@Component({
  templateUrl: './terminal.component.html',
})
export class TerminalComponent implements OnInit, OnDestroy {
  @ViewChild('terminaloutput', { static: true }) termTarget: ElementRef
  private resizeEvent = new Subject()

  constructor(
    private $terminal: TerminalService,
  ) {}

  @HostListener('window:resize', ['$event'])
  onWindowResize() {
    this.resizeEvent.next(undefined)
  }

  ngOnInit() {
    // set body bg color
    window.document.querySelector('body').classList.add('bg-black')

    // start the terminal
    this.$terminal.startTerminal(this.termTarget, {}, this.resizeEvent)

    // set focus to the terminal
    this.$terminal.term.focus()
  }

  ngOnDestroy() {
    // unset body bg color
    window.document.querySelector('body').classList.remove('bg-black')

    // destroy the terminal
    this.$terminal.destroyTerminal()
  }
}

import { TerminalService } from '@/app/core/terminal.service'
import { Component, ElementRef, HostListener, inject, OnDestroy, OnInit, viewChild } from '@angular/core'
import { TranslatePipe } from '@ngx-translate/core'
import { Subject } from 'rxjs'

@Component({
  templateUrl: './terminal.component.html',
  imports: [TranslatePipe],
})
export class TerminalComponent implements OnInit, OnDestroy {
  private $terminal = inject(TerminalService)

  readonly termTarget = viewChild<ElementRef>('terminaloutput')
  private resizeEvent = new Subject()

  @HostListener('window:resize', ['$event'])
  onWindowResize() {
    this.resizeEvent.next(undefined)
  }

  ngOnInit() {
    // set body bg color
    window.document.querySelector('body').classList.add('bg-black')

    // start the terminal
    this.$terminal.startTerminal(this.termTarget(), {}, this.resizeEvent)

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

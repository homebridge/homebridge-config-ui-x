import { IoNamespace, WsService } from '@/app/core/ws.service'
import { ElementRef, Injectable } from '@angular/core'
import { Subject } from 'rxjs'
import { debounceTime } from 'rxjs/operators'
import { ITerminalOptions, Terminal } from 'xterm'
import { FitAddon } from 'xterm-addon-fit'
import { WebLinksAddon } from 'xterm-addon-web-links'

@Injectable({
  providedIn: 'root',
})
export class TerminalService {
  public term: Terminal

  private io: IoNamespace
  private fitAddon: FitAddon
  private webLinksAddon: WebLinksAddon
  private resize: Subject<any>
  private elementResize: Subject<any> | undefined

  constructor(
    private $ws: WsService,
  ) {}

  destroyTerminal() {
    this.io.end()
    this.term.dispose()
    this.resize.complete()
    if (this.elementResize) {
      this.elementResize.complete()
    }
  }

  startTerminal(
    targetElement: ElementRef,
    termOpts: ITerminalOptions = {},
    elementResize?: Subject<any>,
  ) {
    // handle element resize events
    this.elementResize = elementResize

    // connect to the websocket endpoint
    this.io = this.$ws.connectToNamespace('platform-tools/terminal')

    // create a terminal instance
    this.term = new Terminal(termOpts)

    // load addons
    setTimeout(() => {
      this.term.loadAddon(this.fitAddon)
      this.term.loadAddon(this.webLinksAddon)
    })

    this.fitAddon = new FitAddon()
    this.webLinksAddon = new WebLinksAddon()

    // create a subject to listen for resize events
    this.resize = new Subject()

    // open the terminal in the target element
    this.term.open(targetElement.nativeElement)

    // fit to the element
    setTimeout(() => {
      this.fitAddon.activate(this.term)
      this.fitAddon.fit()
    })

    // start the terminal session when the socket is connected
    this.io.connected.pipe(debounceTime(200)).subscribe(() => {
      this.startSession()
    })

    // handle disconnect events
    this.io.socket.on('disconnect', () => {
      this.term.write('\n\r\n\rTerminal disconnected. Is the server running?\n\r\n\r')
    })

    // handle the events
    this.io.socket.on('process-exit', () => {
      this.io.socket.emit('end')
      this.startSession()
    })

    // send resize events to server
    this.resize.pipe(debounceTime(500)).subscribe((size) => {
      this.io.socket.emit('resize', size)
    })

    // subscribe to incoming data events from server to client
    this.io.socket.on('stdout', (data: string) => {
      this.term.write(data)
    })

    // handle outgoing data events from client to server
    this.term.onData((data) => {
      this.io.socket.emit('stdin', data)
    })

    // handle resize events from the client
    this.term.onResize((size) => {
      this.resize.next(size)
    })

    if (this.elementResize) {
      // subscribe to grid resize event
      this.elementResize.pipe(debounceTime(100)).subscribe({
        next: () => {
          this.fitAddon.fit()
        },
      })
    }
  }

  private startSession() {
    this.term.reset()
    this.io.socket.emit('start-session', { cols: this.term.cols, rows: this.term.rows })
    this.resize.next({ cols: this.term.cols, rows: this.term.rows })
  }
}

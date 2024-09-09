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
export class LogService {
  public term: Terminal

  private io: IoNamespace
  private fitAddon: FitAddon
  private webLinksAddon: WebLinksAddon
  private resize: Subject<any>
  private elementResize: Subject<any> | undefined
  private pluginName: string

  constructor(
    private $ws: WsService,
  ) {}

  startTerminal(
    targetElement: ElementRef,
    termOpts: ITerminalOptions = {},
    elementResize?: Subject<any>,
    pluginName?: string,
  ) {
    this.pluginName = pluginName

    // handle element resize events
    this.elementResize = elementResize

    // connect to the websocket endpoint
    this.io = this.$ws.connectToNamespace('log')

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
    this.io.connected.subscribe(() => {
      this.term.reset()
      this.io.socket.emit('tail-log', { cols: this.term.cols, rows: this.term.rows })
    })

    // handle disconnect events
    this.io.socket.on('disconnect', () => {
      this.term.write('\n\r\n\rWebsocket failed to connect. Is the server running?\n\r\n\r')
    })

    // send resize events to server
    this.resize.pipe(debounceTime(500)).subscribe((size) => {
      this.io.socket.emit('resize', size)
    })

    // subscribe to incoming data events from server to client
    this.io.socket.on('stdout', (data: string) => {
      if (this.pluginName) {
        const lines = data.split('\n\r')
        let includeNextLine = false

        lines.forEach((line: string) => {
          if (!line) {
            return
          }

          if (includeNextLine) {
            if (line.match(/36m\[.*?\]/)) {
              includeNextLine = false
            } else {
              this.term.write(`${line}\n\r`)
              return
            }
          }

          if (line.includes(`36m[${this.pluginName}]`)) {
            this.term.write(`${line}\n\r`)
            includeNextLine = true
          }
        })
      } else {
        this.term.write(data)
      }
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

  destroyTerminal() {
    this.io.end()
    this.term.dispose()
    this.resize.complete()
    if (this.elementResize) {
      this.elementResize.complete()
    }
  }
}

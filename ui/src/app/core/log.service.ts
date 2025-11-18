import type { LogFilterOptions } from '@/../../src/modules/log/log.interfaces'

import { ElementRef, inject, Injectable } from '@angular/core'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { ITerminalOptions, Terminal } from '@xterm/xterm'
import { Subject } from 'rxjs'
import { debounceTime } from 'rxjs/operators'

import { IoNamespace, WsService } from '@/app/core/ws.service'

@Injectable({
  providedIn: 'root',
})
export class LogService {
  private $ws = inject(WsService)
  private io: IoNamespace
  private fitAddon: FitAddon
  private webLinksAddon: WebLinksAddon
  private resize: Subject<any>
  private elementResize: Subject<any> | undefined
  private pluginName: string
  private filters: LogFilterOptions | undefined

  public term: Terminal

  public startTerminal(
    targetElement: ElementRef,
    termOpts: ITerminalOptions = {},
    elementResize?: Subject<any>,
    pluginName?: string,
    filters?: LogFilterOptions,
  ) {
    this.pluginName = pluginName
    this.filters = filters

    // Handle element resize events
    this.elementResize = elementResize

    // Connect to the websocket endpoint
    this.io = this.$ws.connectToNamespace('log')

    // Create a terminal instance
    this.term = new Terminal(termOpts)

    // Load addons
    setTimeout(() => {
      this.term.loadAddon(this.fitAddon)
      this.term.loadAddon(this.webLinksAddon)
    })

    this.fitAddon = new FitAddon()
    this.webLinksAddon = new WebLinksAddon()

    // Create a subject to listen for resize events
    this.resize = new Subject()

    // Open the terminal in the target element
    this.term.open(targetElement.nativeElement)

    // Fit to the element
    setTimeout(() => {
      this.fitAddon.activate(this.term)
      this.fitAddon.fit()
    })

    // Start the terminal session when the socket is connected
    this.io.connected.subscribe(() => {
      this.term.reset()
      this.io.socket.emit('tail-log', { cols: this.term.cols, rows: this.term.rows, filters: this.filters })
    })

    // Handle disconnect events
    this.io.socket.on('disconnect', () => {
      this.term.write('\n\r\n\rWebsocket failed to connect. Is the server running?\n\r\n\r')
    })

    // Send resize events to server
    this.resize.pipe(debounceTime(500)).subscribe((size) => {
      this.io.socket.emit('resize', size)
    })

    // Subscribe to incoming data events from server to client
    this.io.socket.on('stdout', (data: string) => {
      this.term.write(data)
    })

    // Handle resize events from the client
    this.term.onResize((size) => {
      this.resize.next(size)
    })

    if (this.elementResize) {
      // Subscribe to grid resize event
      this.elementResize.pipe(debounceTime(100)).subscribe({
        next: () => {
          this.fitAddon.fit()
        },
      })
    }
  }

  public updateLogFilters(filters: LogFilterOptions) {
    this.filters = filters
    if (this.io && this.io.socket) {
      this.io.socket.emit('update-log-filters', filters)
    }
  }

  public destroyTerminal() {
    this.io.end()
    this.term.dispose()
    this.resize.complete()
    if (this.elementResize) {
      this.elementResize.complete()
    }
  }
}

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
  private resize: Subject<{ cols: number, rows: number }>
  private elementResize: Subject<void> | undefined
  private pluginName: string | undefined
  private searchFilter: string | null = null
  private logBuffer: string[] = []
  private readonly maxBufferSize = 1000 // Maximum number of log chunks to keep in buffer

  public term: Terminal

  public startTerminal(
    targetElement: ElementRef,
    termOpts: ITerminalOptions = {},
    elementResize?: Subject<void>,
    pluginName?: string,
  ) {
    this.pluginName = pluginName

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
    this.resize = new Subject<{ cols: number, rows: number }>()

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
      this.logBuffer = []
      this.io.socket.emit('tail-log', { cols: this.term.cols, rows: this.term.rows })
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
        // Store raw data in buffer
        this.logBuffer.push(data)

        // Limit buffer size to prevent memory issues
        if (this.logBuffer.length > this.maxBufferSize) {
          this.logBuffer.shift() // Remove oldest entry
        }

        // Apply search filter if active
        if (this.searchFilter) {
          const lines = data.split('\n\r')
          lines.forEach((line: string) => {
            if (line && this.lineMatchesFilter(line)) {
              this.term.write(`${line}\n\r`)
            }
          })
        } else {
          this.term.write(data)
        }
      }
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

  public setSearchFilter(filter: string): void {
    this.searchFilter = filter.toLowerCase()
    this.redrawTerminalWithFilter()
  }

  public clearSearchFilter(): void {
    this.searchFilter = null
    this.redrawTerminalWithFilter()
  }

  public getSearchFilter(): string | null {
    return this.searchFilter
  }

  public scrollToBottom(): void {
    if (this.term) {
      // Use setTimeout to ensure scrolling happens after any pending terminal updates
      setTimeout(() => this.term.scrollToLine(this.term.buffer.active.length), 10)
    }
  }

  private lineMatchesFilter(line: string): boolean {
    if (!this.searchFilter) {
      return true
    }
    // Strip ANSI color codes before searching
    // eslint-disable-next-line no-control-regex, unicorn/escape-case
    const cleanLine = line.replace(/\x1b\[[0-9;]*m/g, '').toLowerCase()
    return cleanLine.includes(this.searchFilter)
  }

  private redrawTerminalWithFilter(): void {
    if (!this.term) {
      return
    }

    // Clear the terminal
    this.term.clear()

    // Redraw all buffered logs with filter
    this.logBuffer.forEach((data: string) => {
      if (this.searchFilter) {
        const lines = data.split('\n\r')
        lines.forEach((line: string) => {
          if (line && this.lineMatchesFilter(line)) {
            this.term.write(`${line}\n\r`)
          }
        })
      } else {
        this.term.write(data)
      }
    })
  }

  public destroyTerminal() {
    this.io.end()
    this.term.dispose()
    this.resize.complete()
    if (this.elementResize) {
      this.elementResize.complete()
    }
    this.logBuffer = []
    this.searchFilter = null
  }
}

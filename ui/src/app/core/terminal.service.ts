import { ElementRef, inject, Injectable } from '@angular/core'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { IDisposable, ITerminalOptions, Terminal } from '@xterm/xterm'
import { Subject } from 'rxjs'
import { debounceTime } from 'rxjs/operators'

import { ApiService } from '@/app/core/api.service'
import { IoNamespace, WsService } from '@/app/core/ws.service'

@Injectable({
  providedIn: 'root',
})
export class TerminalService {
  private $ws = inject(WsService)
  private $api = inject(ApiService)
  private io: IoNamespace
  private fitAddon: FitAddon
  private webLinksAddon: WebLinksAddon
  private resize: Subject<any>
  private elementResize: Subject<any> | undefined
  private dataDisposable: IDisposable | null = null
  private isInitializing = false
  private hasUserTyped = false
  public term: Terminal

  public destroyTerminal() {
    if (this.dataDisposable) {
      this.dataDisposable.dispose()
      this.dataDisposable = null
    }
    if (this.io) {
      this.io.end()
    }
    if (this.term) {
      this.term.dispose()
      this.term = null
    }
    if (this.resize) {
      this.resize.complete()
    }
    if (this.elementResize) {
      this.elementResize.complete()
    }
    this.isInitializing = false
    this.hasUserTyped = false
  }

  public destroyPersistentSession() {
    // First destroy the frontend terminal
    this.destroyTerminal()

    // Then tell the backend to destroy the persistent session via HTTP API
    this.$api.post('/platform-tools/terminal/destroy-persistent-session', {}).subscribe({
      error: error => console.error('Failed to destroy persistent session:', error),
    })
  }

  public detachTerminal() {
    // Clean up UI components but keep socket connection alive for persistence
    if (this.dataDisposable) {
      this.dataDisposable.dispose()
      this.dataDisposable = null
    }
    if (this.term) {
      this.term.dispose()
    }
    if (this.resize) {
      this.resize.complete()
    }
    if (this.elementResize) {
      this.elementResize.complete()
    }
    // Note: We intentionally do NOT call this.io.end() here to keep the connection alive
    // Keep hasUserTyped state for persistence mode

    this.isInitializing = false
  }

  public hasActiveSession(): boolean {
    const hasSession = !!(
      this.io
      && this.io.socket
      && this.io.socket.connected
    )
    return hasSession
  }

  public async checkBackendPersistentSession(): Promise<boolean> {
    try {
      const response = await this.$api.get('/platform-tools/terminal/has-persistent-session').toPromise() as { hasPersistentSession: boolean }
      return response.hasPersistentSession
    } catch (error) {
      console.error('Failed to check backend persistent session:', error)
      return false
    }
  }

  public hasUserTypedInSession(): boolean {
    return this.hasUserTyped
  }

  public isTerminalReady(): boolean {
    return !!this.term && !this.isInitializing
  }

  public reattachToElement(
    targetElement: ElementRef,
    elementResize?: Subject<any>,
  ) {
    if (!this.term || !this.io?.socket?.connected) {
      return
    }

    // Handle element resize events
    this.elementResize = elementResize

    // Dispose existing data listener before reattaching
    if (this.dataDisposable) {
      this.dataDisposable.dispose()
    }

    // Reattach terminal to new DOM element
    this.term.open(targetElement.nativeElement)

    // Always set up data listener after reattaching to DOM (term.open clears listeners)
    this.dataDisposable = this.term.onData((data) => {
      if (this.io.socket.connected) {
        this.hasUserTyped = true
        this.io.socket.emit('stdin', data)
      }
    })

    // Recreate resize listeners
    if (this.resize) {
      this.resize.complete()
    }
    this.resize = new Subject()

    this.term.onResize((size) => {
      this.resize.next(size)
    })

    this.resize.pipe(debounceTime(500)).subscribe((size) => {
      if (this.io.socket.connected) {
        this.io.socket.emit('resize', size)
      }
    })

    if (this.elementResize) {
      this.elementResize.pipe(debounceTime(100)).subscribe({
        next: () => {
          if (this.fitAddon) {
            this.fitAddon.fit()
          }
        },
      })
    }

    // Fit the terminal
    setTimeout(() => {
      if (this.fitAddon) {
        this.fitAddon.fit()
      }
    }, 100)

    // Rejoin the backend session
    this.io.socket.emit('start-session', {
      cols: this.term.cols,
      rows: this.term.rows,
    })
  }

  public reconnectTerminal(
    targetElement: ElementRef,
    termOpts: ITerminalOptions = {},
    elementResize?: Subject<any>,
  ): boolean {
    if (this.isInitializing) {
      return false
    }

    this.isInitializing = true

    // Handle element resize events
    this.elementResize = elementResize

    // Reuse existing connection if still active
    if (this.io && this.io.socket && this.io.socket.connected) {
      // Create a new terminal instance for the UI
      this.term = new Terminal(termOpts)

      // Load addons
      this.fitAddon = new FitAddon()
      this.webLinksAddon = new WebLinksAddon()

      setTimeout(() => {
        this.term.loadAddon(this.fitAddon)
        this.term.loadAddon(this.webLinksAddon)
      })

      // Create a subject to listen for resize events
      this.resize = new Subject()

      // Open the terminal in the target element
      this.term.open(targetElement.nativeElement)

      // Fit to the element
      setTimeout(() => {
        this.fitAddon.activate(this.term)
        this.fitAddon.fit()
      })

      // Remove existing listeners to avoid duplicates
      this.io.socket.removeAllListeners('stdout')
      this.io.socket.removeAllListeners('process-exit')

      // Subscribe to incoming data events from server to client
      this.io.socket.on('stdout', (data: string) => {
        this.term.write(data)
      })

      // Handle terminal process exit - immediately start new session
      this.io.socket.on('process-exit', () => {
        this.startSession()
      })

      // Handle outgoing data events from client to server
      // Dispose any existing data listener first
      if (this.dataDisposable) {
        this.dataDisposable.dispose()
      }
      this.dataDisposable = this.term.onData((data) => {
        this.hasUserTyped = true
        this.io.socket.emit('stdin', data)
      })

      // Handle resize events from the client
      this.term.onResize((size) => {
        this.resize.next(size)
      })

      // Send resize events to server
      this.resize.pipe(debounceTime(500)).subscribe((size) => {
        this.io.socket.emit('resize', size)
      })

      if (this.elementResize) {
        // Subscribe to grid resize event
        this.elementResize.pipe(debounceTime(100)).subscribe({
          next: () => {
            this.fitAddon.fit()
          },
        })
      }

      // Rejoin the existing session
      this.io.socket.emit('start-session', {
        cols: this.term.cols,
        rows: this.term.rows,
      })

      this.isInitializing = false
    } else {
      // No active connection, start fresh
      this.startTerminal(targetElement, termOpts, elementResize)
    }
  }

  public startTerminal(
    targetElement: ElementRef,
    termOpts: ITerminalOptions = {},
    elementResize?: Subject<any>,
  ): boolean {
    if (this.isInitializing) {
      return false
    }

    this.isInitializing = true

    // Handle element resize events
    this.elementResize = elementResize

    // Connect to the websocket endpoint
    this.io = this.$ws.connectToNamespace('platform-tools/terminal')

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
    this.io.connected.pipe(debounceTime(200)).subscribe(() => {
      this.startSession()
    })

    // Handle disconnect events
    this.io.socket.on('disconnect', () => {
      this.term.write(
        '\n\r\n\rTerminal disconnected. Is the server running?\n\r\n\r',
      )
    })

    // Handle terminal process exit - immediately start new session
    this.io.socket.on('process-exit', () => {
      this.startSession()
    })

    // Send resize events to server
    this.resize.pipe(debounceTime(500)).subscribe((size) => {
      this.io.socket.emit('resize', size)
    })

    // Subscribe to incoming data events from server to client
    this.io.socket.on('stdout', (data: string) => {
      this.term.write(data)
    })

    // Handle outgoing data events from client to server
    this.dataDisposable = this.term.onData((data) => {
      this.hasUserTyped = true
      this.io.socket.emit('stdin', data)
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
    return true
  }

  private startSession() {
    this.term.reset()
    this.hasUserTyped = false
    this.io.socket.emit('start-session', {
      cols: this.term.cols,
      rows: this.term.rows,
    })
    this.resize.next({ cols: this.term.cols, rows: this.term.rows })
    this.isInitializing = false
  }
}

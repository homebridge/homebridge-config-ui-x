import { ElementRef, inject, Injectable } from '@angular/core'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { IDisposable, ITerminalOptions, Terminal } from '@xterm/xterm'
import { Subject } from 'rxjs'
import { debounceTime, takeUntil } from 'rxjs/operators'

import { ApiService } from '@/app/core/communication/api.service'
import { IoNamespace, WsService } from '@/app/core/communication/ws.service'

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
  private destroy$ = new Subject<void>()
  public term: Terminal

  public destroyTerminal() {
    // Complete all subscriptions
    this.destroy$.next()
    this.destroy$.complete()

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

    // Reset for next session
    this.destroy$ = new Subject<void>()
    this.isInitializing = false
    this.hasUserTyped = false
  }

  public async destroyPersistentSession(): Promise<void> {
    // First destroy the frontend terminal
    this.destroyTerminal()

    // Then tell the backend to destroy the persistent session via HTTP API
    try {
      await this.$api.post('/platform-tools/terminal/destroy-persistent-session', {})
    } catch (error) {
      console.error('Failed to destroy persistent session:', error)
    }
  }

  public detachTerminal() {
    // Clean up UI components but keep socket connection alive for persistence
    this.destroy$.next()
    this.destroy$.complete()

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

    // Reset for next session
    this.destroy$ = new Subject<void>()

    // Note: We intentionally do NOT call this.io.end() here to keep the connection alive
    // Keep hasUserTyped state for persistence mode
    this.isInitializing = false
  }

  public hasActiveSession(): boolean {
    return this.io && this.io.socket && this.io.socket.connected
  }

  public hasUserTypedInSession(): boolean {
    return this.hasUserTyped
  }

  public isTerminalReady(): boolean {
    return this.term && !this.isInitializing
  }

  public activateTerminal(): void {
    if (this.isTerminalReady() && this.term) {
      this.term.focus()
    }
  }

  private touchStartY: number | null = null

  public onTouchStart(event: TouchEvent): void {
    this.touchStartY = event.touches[0].clientY
  }

  public onTouchEnd(event: TouchEvent): void {
    if (this.touchStartY === null) {
      return
    }
    const deltaY = Math.abs(event.changedTouches[0].clientY - this.touchStartY)
    this.touchStartY = null
    // Only focus if the finger barely moved (tap, not scroll)
    if (deltaY < 10) {
      this.activateTerminal()
    }
  }

  public reconnectTerminal(targetElement: ElementRef, termOpts: ITerminalOptions = {}, elementResize?: Subject<any>): boolean {
    if (this.isInitializing) {
      return false
    }

    this.isInitializing = true

    // Handle element resize events
    this.elementResize = elementResize

    // Reuse existing connection if still active
    if (this.io && this.io.socket && this.io.socket.connected) {
      // Create addons
      this.fitAddon = new FitAddon()
      this.webLinksAddon = new WebLinksAddon()

      // Create a new terminal instance for the UI
      this.term = new Terminal(termOpts)

      // Load addons before open
      this.term.loadAddon(this.fitAddon)
      this.term.loadAddon(this.webLinksAddon)

      // Create a subject to listen for resize events
      this.resize = new Subject()

      // Open the terminal in the target element
      this.term.open(targetElement.nativeElement)

      // Fit to the element
      setTimeout(() => {
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
      this.resize
        .pipe(
          debounceTime(500),
          takeUntil(this.destroy$),
        )
        .subscribe((size) => {
          this.io.socket.emit('resize', size)
        })

      if (this.elementResize) {
        // Subscribe to grid resize event
        this.elementResize
          .pipe(
            debounceTime(100),
            takeUntil(this.destroy$),
          )
          .subscribe({
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

  public startTerminal(targetElement: ElementRef, termOpts: ITerminalOptions = {}, elementResize?: Subject<any>): boolean {
    if (this.isInitializing) {
      return false
    }

    this.isInitializing = true

    // Handle element resize events
    this.elementResize = elementResize

    // Connect to the websocket endpoint
    this.io = this.$ws.connectToNamespace('platform-tools/terminal')

    // Create addons
    this.fitAddon = new FitAddon()
    this.webLinksAddon = new WebLinksAddon()

    // Create a terminal instance
    this.term = new Terminal(termOpts)

    // Load addons before open
    this.term.loadAddon(this.fitAddon)
    this.term.loadAddon(this.webLinksAddon)

    // Create a subject to listen for resize events
    this.resize = new Subject()

    // Open the terminal in the target element
    this.term.open(targetElement.nativeElement)

    // Fit to the element
    setTimeout(() => {
      this.fitAddon.fit()
    })

    // Start the terminal session when the socket is connected
    this.io.connected
      .pipe(
        debounceTime(200),
        takeUntil(this.destroy$),
      )
      .subscribe(() => {
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
    this.resize
      .pipe(
        debounceTime(500),
        takeUntil(this.destroy$),
      )
      .subscribe((size) => {
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
      this.elementResize
        .pipe(
          debounceTime(100),
          takeUntil(this.destroy$),
        )
        .subscribe({
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

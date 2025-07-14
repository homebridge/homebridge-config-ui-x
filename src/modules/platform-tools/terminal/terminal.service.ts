import type { EventEmitter } from 'node:events'

import os from 'node:os'
import process from 'node:process'

import { Injectable } from '@nestjs/common'
import { pathExists } from 'fs-extra'

import { ConfigService } from '../../../core/config/config.service'
import { Logger } from '../../../core/logger/logger.service'
import { NodePtyService } from '../../../core/node-pty/node-pty.service'

export interface TermSize {
  cols: number
  rows: number
}

@Injectable()
export class TerminalService {
  private ending = false
  private static persistentTerminal: any = null
  private static currentClient: WsEventEmitter | null = null
  private static dataListenerAttached = false
  private static terminalBuffer: string = ''
  private instanceId: string

  constructor(
    private configService: ConfigService,
    private logger: Logger,
    private nodePtyService: NodePtyService,
  ) {
    this.instanceId = Math.random().toString(36).substring(2, 11)
    this.logger.log(`TerminalService instance created: ${this.instanceId}`)
  }

  /**
   * Get the preferred shell for the current platform
   */
  private async getPreferredShell(): Promise<'/bin/zsh' | '/bin/bash' | '/bin/sh'> {
    // On macOS, prefer zsh if available
    if (os.platform() === 'darwin' && await pathExists('/bin/zsh')) {
      return '/bin/zsh'
    }

    // Fallback to bash if available, otherwise sh
    return await pathExists('/bin/bash') ? '/bin/bash' : '/bin/sh'
  }

  /**
   * Create a new terminal session
   * @param client
   * @param size
   */
  async startSession(client: WsEventEmitter, size: TermSize) {
    this.ending = false

    // If terminal is not enabled, disconnect the client
    if (!this.configService.enableTerminalAccess) {
      this.logger.error('Terminal is not enabled, disconnecting client...')
      client.disconnect()
      return
    }

    // Check if terminal persistence is enabled
    const terminalPersistence = Boolean(this.configService.ui.terminalPersistence)

    if (terminalPersistence) {
      return this.attachToPersistentTerminal(client, size)
    } else {
      return this.createNewTerminal(client, size)
    }
  }

  private async createNewTerminal(client: WsEventEmitter, size: TermSize) {
    this.logger.log('Starting new terminal session.')

    // Get the preferred shell for the current platform
    const shell = await this.getPreferredShell()

    // Spawn a new shell
    const term = this.nodePtyService.spawn(shell, [], {
      name: 'xterm-color',
      cols: size.cols,
      rows: size.rows,
      cwd: this.configService.storagePath,
      env: process.env,
    })

    // Write to the client
    term.onData((data) => {
      client.emit('stdout', data)
    })

    // Let the client know when the session ends
    term.onExit((code) => {
      try {
        if (!this.ending) {
          client.emit('process-exit', code)
        }
      } catch (e) {
        // The client socket probably closed
      }
    })

    // Write input to the terminal
    client.on('stdin', (data) => {
      term.write(data)
    })

    // capture resize events
    client.on('resize', (resize: TermSize) => {
      try {
        term.resize(resize.cols, resize.rows)
      } catch (e) {}
    })

    // cleanup on disconnect
    const onEnd = () => {
      this.ending = true

      client.removeAllListeners('stdin')
      client.removeAllListeners('resize')
      client.removeAllListeners('end')
      client.removeAllListeners('disconnect')

      try {
        this.logger.log('Terminal session ended.')
        term.kill()
      } catch (e) {}
    }

    client.on('end', onEnd.bind(this))
    client.on('disconnect', onEnd.bind(this))
  }

  private async attachToPersistentTerminal(client: WsEventEmitter, size: TermSize) {
    this.logger.log(`[${this.instanceId}] attachToPersistentTerminal called`)

    // If we don't have a persistent terminal, create one
    if (!TerminalService.persistentTerminal) {
      this.logger.log(`[${this.instanceId}] Creating new persistent terminal session.`)

      const shell = await this.getPreferredShell()

      TerminalService.persistentTerminal = this.nodePtyService.spawn(shell, [], {
        name: 'xterm-color',
        cols: size.cols,
        rows: size.rows,
        cwd: this.configService.storagePath,
        env: process.env,
      })

      // Set up the SINGLE data listener that routes to current client
      if (!TerminalService.dataListenerAttached) {
        this.logger.log(`[${this.instanceId}] Attaching data listener`)
        TerminalService.persistentTerminal.onData((data) => {
          try {
            this.logger.log(`[${this.instanceId}] Terminal output: "${data}", length: ${data.length}`)

            // Add to buffer for future clients
            TerminalService.terminalBuffer += data

            // Keep buffer size reasonable (configurable)
            const maxBufferSize = this.configService.ui.terminalBufferSize || globalThis.terminal.bufferSize
            if (TerminalService.terminalBuffer.length > maxBufferSize) {
              TerminalService.terminalBuffer = TerminalService.terminalBuffer.slice(-maxBufferSize)
            }

            if (TerminalService.currentClient) {
              this.logger.log(`[${this.instanceId}] Sending output to current client`)
              TerminalService.currentClient.emit('stdout', data)
            } else {
              this.logger.log(`[${this.instanceId}] No current client to send output to!`)
            }
          } catch (e) {
            this.logger.log(`[${this.instanceId}] Error sending output to client: ${e}`)
          }
        })
        TerminalService.dataListenerAttached = true
      }

      // Handle terminal exit
      TerminalService.persistentTerminal.onExit((code: any) => {
        this.logger.log(`[${this.instanceId}] Persistent terminal exited.`)

        // Notify the current client that the process has exited
        if (TerminalService.currentClient) {
          try {
            TerminalService.currentClient.emit('process-exit', code)
          } catch (e) {
            // Client socket probably closed
          }
        }

        TerminalService.persistentTerminal = null
        TerminalService.currentClient = null
        TerminalService.dataListenerAttached = false
        TerminalService.terminalBuffer = ''
      })
    } else {
      this.logger.log(`[${this.instanceId}] Attaching to existing persistent terminal.`)
      // Resize to match current client
      try {
        TerminalService.persistentTerminal.resize(size.cols, size.rows)
      } catch (e) {}
    }

    // Clean up any existing listeners on this client before adding new ones
    this.logger.log(`[${this.instanceId}] Cleaning up existing client listeners`)
    client.removeAllListeners('stdin')
    client.removeAllListeners('resize')

    // Switch to the new client
    this.logger.log(`[${this.instanceId}] Switching current client`)
    TerminalService.currentClient = client

    // Send buffer to new client if this is an existing persistent terminal
    if (TerminalService.terminalBuffer && TerminalService.terminalBuffer.length > 0) {
      this.logger.log(`[${this.instanceId}] Sending ${TerminalService.terminalBuffer.length} chars of buffer to new client`)
      try {
        client.emit('stdout', TerminalService.terminalBuffer)
      } catch (e) {
        this.logger.log(`[${this.instanceId}] Error sending buffer to client: ${e}`)
      }
    } else {
      this.logger.log(`[${this.instanceId}] No buffer to send to new client`)
    }

    // Always add listeners for the new client (each client needs its own listeners)
    this.logger.log(`[${this.instanceId}] Adding stdin and resize listeners`)

    client.on('stdin', (data) => {
      this.logger.log(`[${this.instanceId}] Received stdin from client: "${data}", length: ${data.length}`)
      if (TerminalService.persistentTerminal) {
        this.logger.log(`[${this.instanceId}] Writing to persistent terminal: "${data}"`)
        TerminalService.persistentTerminal.write(data)
      } else {
        this.logger.log(`[${this.instanceId}] No persistent terminal to write to!`)
      }
    })

    client.on('resize', (resize: TermSize) => {
      this.logger.log(`[${this.instanceId}] Received resize from client`)
      try {
        if (TerminalService.persistentTerminal) {
          TerminalService.persistentTerminal.resize(resize.cols, resize.rows)
        }
      } catch (e) {}
    })

    // Clean up client listeners on disconnect (but keep terminal alive)
    const onEnd = () => {
      this.logger.log(`[${this.instanceId}] Client disconnecting`)

      // Remove all listeners from this specific client
      client.removeAllListeners('stdin')
      client.removeAllListeners('resize')
      client.removeAllListeners('end')
      client.removeAllListeners('disconnect')

      // Clear current client if this was the active one
      if (TerminalService.currentClient === client) {
        TerminalService.currentClient = null
        this.logger.log(`[${this.instanceId}] Cleared current client`)
      }

      this.logger.log(`[${this.instanceId}] Client cleanup complete`)
    }

    client.on('end', onEnd)
    client.on('disconnect', onEnd)
  }

  /**
   * Destroy the persistent terminal session completely
   * This is called when terminal persistence is disabled
   */
  destroyPersistentSession() {
    this.logger.log(`[${this.instanceId}] Destroying persistent terminal session`)

    if (TerminalService.persistentTerminal) {
      try {
        this.logger.log(`[${this.instanceId}] Killing persistent terminal process`)
        TerminalService.persistentTerminal.kill()
      } catch (e) {
        this.logger.log(`[${this.instanceId}] Error killing persistent terminal: ${e}`)
      }
      TerminalService.persistentTerminal = null
    }

    // Clear the terminal buffer
    TerminalService.terminalBuffer = ''

    // Clear data listener flag
    TerminalService.dataListenerAttached = false

    // Clear current client reference
    TerminalService.currentClient = null

    this.logger.log(`[${this.instanceId}] Persistent terminal session destroyed`)
  }
}

export interface WsEventEmitter extends EventEmitter {
  disconnect: () => void
}

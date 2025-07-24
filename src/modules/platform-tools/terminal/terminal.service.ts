import type { IPty } from '@homebridge/node-pty-prebuilt-multiarch'
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
  private static persistentTerminal: IPty | null = null
  private static connectedClients: Set<WsEventEmitter> = new Set()
  private static dataListenerAttached = false
  private static terminalBuffer: string = ''
  private instanceId: string

  constructor(
    private configService: ConfigService,
    private logger: Logger,
    private nodePtyService: NodePtyService,
  ) {
    this.instanceId = Math.random().toString(36).substring(2, 11)
    this.logger.debug(`TerminalService instance created: ${this.instanceId}`)
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
      this.logger.warn('Terminal is not enabled, disconnecting client...')
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
    term.onExit((exitInfo: { exitCode: number, signal?: number }) => {
      try {
        if (!this.ending) {
          client.emit('process-exit', exitInfo.exitCode)
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
    this.logger.debug(`[${this.instanceId}] attachToPersistentTerminal called`)

    // If we don't have a persistent terminal, create one
    if (!TerminalService.persistentTerminal) {
      this.logger.debug(`[${this.instanceId}] Creating new persistent terminal session.`)

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
        this.logger.debug(`[${this.instanceId}] Attaching data listener`)
        TerminalService.persistentTerminal.onData((data) => {
          try {
            this.logger.debug(`[${this.instanceId}] Terminal output: ${data.length} characters`)

            // Add to buffer for future clients
            TerminalService.terminalBuffer += data

            // Keep buffer size reasonable (configurable)
            const maxBufferSize = this.configService.ui.terminalBufferSize
            if (TerminalService.terminalBuffer.length > maxBufferSize) {
              TerminalService.terminalBuffer = TerminalService.terminalBuffer.slice(-maxBufferSize)
            }

            if (TerminalService.connectedClients.size > 0) {
              this.logger.debug(`[${this.instanceId}] Sending output to ${TerminalService.connectedClients.size} connected clients`)
              TerminalService.connectedClients.forEach((client) => {
                try {
                  client.emit('stdout', data)
                } catch (e) {
                  this.logger.error(`[${this.instanceId}] Error sending output to a client: ${e}`)
                  // Remove client if it's no longer valid
                  TerminalService.connectedClients.delete(client)
                }
              })
            }
          } catch (e) {
            this.logger.error(`[${this.instanceId}] Error sending output to client: ${e}`)
          }
        })
        TerminalService.dataListenerAttached = true
      }

      // Handle terminal exit
      TerminalService.persistentTerminal.onExit((exitInfo: { exitCode: number, signal?: number }) => {
        this.logger.debug(`[${this.instanceId}] Persistent terminal exited.`)

        // Notify all connected clients that the process has exited
        TerminalService.connectedClients.forEach((client) => {
          try {
            client.emit('process-exit', exitInfo.exitCode)
          } catch (e) {
            // Client socket probably closed, remove it
            TerminalService.connectedClients.delete(client)
          }
        })

        TerminalService.persistentTerminal = null
        TerminalService.connectedClients.clear()
        TerminalService.dataListenerAttached = false
        TerminalService.terminalBuffer = ''
      })
    } else {
      this.logger.debug(`[${this.instanceId}] Attaching to existing persistent terminal.`)
      // Resize to match current client
      try {
        TerminalService.persistentTerminal.resize(size.cols, size.rows)
      } catch (e) {}
    }

    // Clean up any existing listeners on this client before adding new ones
    this.logger.debug(`[${this.instanceId}] Cleaning up existing client listeners`)
    client.removeAllListeners('stdin')
    client.removeAllListeners('resize')

    // Add client to connected clients set
    this.logger.debug(`[${this.instanceId}] Adding client to connected clients`)
    TerminalService.connectedClients.add(client)

    // Send buffer to new client if this is an existing persistent terminal
    if (TerminalService.terminalBuffer && TerminalService.terminalBuffer.length > 0) {
      this.logger.debug(`[${this.instanceId}] Sending ${TerminalService.terminalBuffer.length} chars of buffer to new client`)
      try {
        client.emit('stdout', TerminalService.terminalBuffer)
      } catch (e) {
        this.logger.error(`[${this.instanceId}] Error sending buffer to client: ${e}`)
      }
    } else {
      this.logger.debug(`[${this.instanceId}] No buffer to send to new client`)
    }

    // Always add listeners for the new client (each client needs its own listeners)
    this.logger.debug(`[${this.instanceId}] Adding stdin and resize listeners`)

    client.on('stdin', (data) => {
      this.logger.debug(`[${this.instanceId}] Received stdin from client: ${data.length} characters`)
      if (TerminalService.persistentTerminal) {
        this.logger.debug(`[${this.instanceId}] Writing to persistent terminal: ${data.length} characters`)
        TerminalService.persistentTerminal.write(data)
      } else {
        this.logger.warn(`[${this.instanceId}] No persistent terminal to write to!`)
      }
    })

    client.on('resize', (resize: TermSize) => {
      this.logger.debug(`[${this.instanceId}] Received resize from client`)
      try {
        if (TerminalService.persistentTerminal) {
          TerminalService.persistentTerminal.resize(resize.cols, resize.rows)
        }
      } catch (e) {}
    })

    // Clean up client listeners on disconnect (but keep terminal alive)
    const onEnd = () => {
      this.logger.debug(`[${this.instanceId}] Client disconnecting`)

      // Remove all listeners from this specific client
      client.removeAllListeners('stdin')
      client.removeAllListeners('resize')
      client.removeAllListeners('end')
      client.removeAllListeners('disconnect')

      // Remove client from connected clients set
      if (TerminalService.connectedClients.has(client)) {
        TerminalService.connectedClients.delete(client)
        this.logger.debug(`[${this.instanceId}] Removed client from connected clients`)
      }

      this.logger.debug(`[${this.instanceId}] Client cleanup complete`)
    }

    client.on('end', onEnd)
    client.on('disconnect', onEnd)
  }

  /**
   * Check if there's an active persistent terminal session
   * This is the authoritative source of truth for backend state
   */
  hasPersistentSession(): boolean {
    const hasPersistent = TerminalService.persistentTerminal !== null
    this.logger.debug(`[${this.instanceId}] hasPersistentSession: ${hasPersistent}`)
    return hasPersistent
  }

  /**
   * Destroy the persistent terminal session completely
   * This is called when terminal persistence is disabled
   */
  destroyPersistentSession() {
    this.logger.debug(`[${this.instanceId}] Destroying persistent terminal session`)

    if (TerminalService.persistentTerminal) {
      try {
        this.logger.debug(`[${this.instanceId}] Killing persistent terminal process`)
        TerminalService.persistentTerminal.kill()
      } catch (e) {
        this.logger.error(`[${this.instanceId}] Error killing persistent terminal: ${e}`)
      }
      TerminalService.persistentTerminal = null
    }

    // Clear the terminal buffer
    TerminalService.terminalBuffer = ''

    // Clear data listener flag
    TerminalService.dataListenerAttached = false

    // Clear all connected clients
    TerminalService.connectedClients.clear()

    this.logger.debug(`[${this.instanceId}] Persistent terminal session destroyed`)
  }
}

export interface WsEventEmitter extends EventEmitter {
  disconnect: () => void
}

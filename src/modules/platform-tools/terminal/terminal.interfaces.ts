import type { EventEmitter } from 'node:events'

export interface TermSize {
  cols: number
  rows: number
}

export interface WsEventEmitter extends EventEmitter {
  disconnect: () => void
}

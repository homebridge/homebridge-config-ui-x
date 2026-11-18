import type { Buffer } from 'node:buffer'

import { StringDecoder } from 'node:string_decoder'

/** Output with no newline is written once this much of it is held */
export const MAX_HELD_LINE_LENGTH = 16 * 1024

/**
 * Collects a stream's output and writes it in whole lines, so lines from two streams (Homebridge's stdout and
 * stderr) do not mix half-way in the log file.
 *
 * Only the new text is searched for a newline, and text with none is written once MAX_HELD_LINE_LENGTH of it is
 * held: output that never ends a line (ffmpeg's progress ends lines in `\r`) would otherwise be kept in memory
 * for ever, never reach the log, and make every new chunk slower.
 */
export class LineBuffer {
  private readonly decoder = new StringDecoder('utf8')
  private held = ''

  constructor(private readonly write: (text: string) => void) {}

  public push(data: Buffer | string): void {
    const text = typeof data === 'string'
      ? data
      : this.decoder.write(data)
    const lastNewline = text.lastIndexOf('\n')
    if (lastNewline === -1) {
      this.held += text
    } else {
      this.write(this.held + text.slice(0, lastNewline + 1))
      this.held = text.slice(lastNewline + 1)
    }
    if (this.held.length >= MAX_HELD_LINE_LENGTH) {
      this.write(`${this.held}\n`)
      this.held = ''
    }
  }

  /** Write what is left, ending it with a newline */
  public end(): void {
    const rest = this.held + this.decoder.end()
    this.held = ''
    if (rest) {
      this.write(rest.endsWith('\n')
        ? rest
        : `${rest}\n`)
    }
  }
}

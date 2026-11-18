import type { WriteStream } from 'node:fs'

import { Buffer } from 'node:buffer'
import { createWriteStream } from 'node:fs'
import { open, stat } from 'node:fs/promises'

/** The most of the old log kept when the log is trimmed, whatever `truncateSize` says (it is read into memory) */
export const MAX_KEPT_LOG_BYTES = 10 * 1024 * 1024

/**
 * Open the log file for appending. A file that can't be opened or written (owned by root after a `sudo` run, a
 * full disk) calls `onError` instead of crashing hb-service with an unhandled `error` event.
 */
export function openLogFile(path: string, onError: (error: Error) => void): WriteStream {
  const stream = createWriteStream(path, { flags: 'a' })
  stream.on('error', onError)
  return stream
}

/**
 * Trim the log file to its newest `truncateSize` bytes once it reaches `maxSize`. Returns true when it was trimmed.
 *
 * The part kept is never more than the file, `maxSize` or MAX_KEPT_LOG_BYTES, and starts after a line break, so
 * the log never starts with half a line (or half a character).
 */
export async function truncateLogFile(path: string, maxSize: number, truncateSize: number): Promise<boolean> {
  if (!(maxSize >= 0)) {
    return false
  }
  const { size } = await stat(path)
  if (size < maxSize) {
    return false
  }

  // A maximum of 0 trims at every check, as it always did; it is no limit on what is kept, or the log would be
  // emptied at every start and every two hours
  const keep = Math.max(0, Math.min(Math.floor(truncateSize) || 0, size, maxSize > 0
    ? maxSize
    : Infinity, MAX_KEPT_LOG_BYTES))
  let kept: Buffer
  const handle = await open(path, 'r+')
  try {
    const buffer = Buffer.alloc(keep)
    const { bytesRead } = keep > 0
      ? await handle.read(buffer, 0, keep, size - keep)
      : { bytesRead: 0 }
    kept = buffer.subarray(0, bytesRead)
    // Start at a whole line, unless the part kept starts one already
    const firstBreak = kept.indexOf(0x0A)
    if (firstBreak !== -1 && size - keep > 0) {
      kept = kept.subarray(firstBreak + 1)
    }
    await handle.truncate(0)
  } finally {
    await handle.close()
  }
  // Appended, not written at the start: a log line already on its way to the file (cork only holds back writes
  // that have not started) can land just after the truncate, and a write at the start would cut it in half
  const append = await open(path, 'a')
  try {
    await append.write(kept)
  } finally {
    await append.close()
  }
  return true
}

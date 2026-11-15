import type { WriteStream } from 'node:fs'

import { createWriteStream } from 'node:fs'

/**
 * Open the log file for appending. A file that can't be opened or written (owned by root after a `sudo` run, a
 * full disk) calls `onError` instead of crashing hb-service with an unhandled `error` event.
 */
export function openLogFile(path: string, onError: (error: Error) => void): WriteStream {
  const stream = createWriteStream(path, { flags: 'a' })
  stream.on('error', onError)
  return stream
}

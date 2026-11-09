import type { Logger } from './logger.js'

import process from 'node:process'
import { createInterface } from 'node:readline/promises'

/**
 * Warn that a Node.js release is not supported on this system, and ask whether to
 * install it anyway. It needs someone at a terminal to agree, so an unattended
 * update stays on the working version.
 */
export async function confirmUnsupportedNode(version: string, logger: Pick<Logger, 'warn' | 'error'>): Promise<boolean> {
  logger.warn(`Node.js ${version} is not supported on this system. Installing it can leave Node.js and hb-service unable to start.`)

  let confirmed = false
  if (process.stdin.isTTY) {
    const prompt = createInterface({ input: process.stdin, output: process.stdout })
    const answer = await prompt.question('Are you sure you want to install it? (y/N) ')
    prompt.close()
    confirmed = /^y(?:es)?$/i.test(answer.trim())
  }

  if (!confirmed) {
    logger.error('Node.js was not changed.')
  }
  return confirmed
}

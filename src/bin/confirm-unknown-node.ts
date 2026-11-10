import type { Logger } from './logger.js'

import process from 'node:process'
import { createInterface } from 'node:readline/promises'

/**
 * Warn that a Node.js release is newer than those Homebridge knows about, and ask
 * whether to install it anyway. It needs someone at a terminal to agree, so an
 * unattended update stays on the working version.
 */
export async function confirmUnknownNode(version: string, logger: Pick<Logger, 'warn' | 'error'>): Promise<boolean> {
  logger.warn(`Node.js ${version} is newer than the versions Homebridge has been tested with, so you would be in uncharted waters. Homebridge and your plugins may not work.`)

  let confirmed = false
  if (process.stdin.isTTY) {
    const prompt = createInterface({ input: process.stdin, output: process.stdout })
    // Closing the prompt with Ctrl-C or Ctrl-D counts as a no
    const answer = await prompt.question('Are you sure you want to install it? (y/N) ').catch(() => '')
    prompt.close()
    confirmed = /^y(?:es)?$/i.test(answer.trim())
  }

  if (!confirmed) {
    logger.error('Node.js was not changed.')
  }
  return confirmed
}

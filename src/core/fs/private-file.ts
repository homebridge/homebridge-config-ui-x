import { chmod, writeFile } from 'node:fs/promises'

/**
 * Write a file that holds a secret (a TLS private key, a pfx bundle) so only its owner can read it.
 * `writeFile` applies a mode only when it creates the file, so an existing file is made private first: made
 * private after the write, the new secret would be readable by every user for a moment.
 */
export async function writePrivateFile(path: string, data: string | Uint8Array): Promise<void> {
  await chmod(path, 0o600).catch((e) => {
    if (e?.code !== 'ENOENT') {
      throw e
    }
  })
  await writeFile(path, data, { mode: 0o600 })
  await chmod(path, 0o600)
}

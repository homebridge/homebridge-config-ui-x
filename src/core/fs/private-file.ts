import { chmod, writeFile } from 'node:fs/promises'

/**
 * Write a file that holds a secret (a TLS private key, a pfx bundle) so only its owner can read it.
 * `writeFile` applies a mode only when it creates the file, so an existing file is made private too.
 */
export async function writePrivateFile(path: string, data: string | Uint8Array): Promise<void> {
  await writeFile(path, data, { mode: 0o600 })
  await chmod(path, 0o600)
}

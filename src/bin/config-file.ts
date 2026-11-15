import { randomBytes } from 'node:crypto'
import { readFile, realpath, rename, stat, unlink, writeFile } from 'node:fs/promises'
import process from 'node:process'

/**
 * Read config.json for hb-service's start-up check.
 *
 * Returns `undefined` only when the file is there but is not a JSON object: that file is set aside and a new one
 * made. Any other error (no permission to read it, a disk error) is thrown: hb-service must then leave the file
 * alone, as a new config.json has a new bridge username and pin, which unpairs the bridge from HomeKit.
 */
export async function readConfigForCheck(path: string): Promise<Record<string, any> | undefined> {
  // A byte order mark (Windows Notepad adds one) is not part of the JSON: Homebridge strips it too
  const text = (await readFile(path, 'utf8')).replace(/^\uFEFF/, '')
  try {
    const config = JSON.parse(text)
    return config && typeof config === 'object' && !Array.isArray(config)
      ? config
      : undefined
  } catch {
    return undefined
  }
}

/**
 * Write config.json through a temp file and a rename, so a crash or a full disk can never leave half a file
 * (which the next start would treat as broken and replace). A symlink and the file's mode are kept.
 */
export async function writeConfigAtomically(path: string, config: unknown): Promise<void> {
  let target = path
  let mode: number | undefined
  try {
    target = await realpath(path)
    mode = (await stat(target)).mode & 0o7777
  } catch (e) {
    if (e?.code !== 'ENOENT') {
      throw e
    }
  }
  const tmpPath = `${target}.tmp.${process.pid}.${randomBytes(6).toString('hex')}`
  try {
    await writeFile(tmpPath, `${JSON.stringify(config, null, 4)}\n`, mode === undefined
      ? undefined
      : { mode })
    await rename(tmpPath, target)
  } catch (e) {
    await unlink(tmpPath).catch(() => undefined)
    throw e
  }
}

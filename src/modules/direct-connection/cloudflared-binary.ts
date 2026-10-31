import { randomBytes } from 'node:crypto'
import { createWriteStream } from 'node:fs'
import { chmod, readdir, rename, rm } from 'node:fs/promises'
import { basename, join } from 'node:path'
import process from 'node:process'
import { pipeline } from 'node:stream/promises'

import axios from 'axios'
import { ensureDir, pathExists } from 'fs-extra/esm'
import { extract } from 'tar'

/**
 * The cloudflared release the UI downloads. Pinned so every install runs the
 * same binary - bump it deliberately, never track "latest".
 */
export const CLOUDFLARED_VERSION = '2026.10.7'

const RELEASE_BASE = 'https://github.com/cloudflare/cloudflared/releases/download'

const ASSETS: Record<string, Record<string, string>> = {
  linux: {
    x64: 'cloudflared-linux-amd64',
    arm64: 'cloudflared-linux-arm64',
    arm: 'cloudflared-linux-arm',
    ia32: 'cloudflared-linux-386',
  },
  darwin: {
    x64: 'cloudflared-darwin-amd64.tgz',
    arm64: 'cloudflared-darwin-arm64.tgz',
  },
  win32: {
    x64: 'cloudflared-windows-amd64.exe',
    // Windows on Arm runs the x64 build under emulation
    arm64: 'cloudflared-windows-amd64.exe',
    ia32: 'cloudflared-windows-386.exe',
  },
}

/**
 * The release asset for this platform, or null when Cloudflare does not ship
 * one (FreeBSD, for example). An explicit UIX_CLOUDFLARED_BIN always works.
 */
export function cloudflaredAssetName(platform: string = process.platform, arch: string = process.arch): string | null {
  return ASSETS[platform]?.[arch] ?? null
}

export function isCloudflaredSupported(): boolean {
  return Boolean(process.env.UIX_CLOUDFLARED_BIN) || cloudflaredAssetName() !== null
}

/**
 * Resolve the cloudflared binary, downloading the pinned release into
 * `binDir` the first time. Nothing is downloaded at npm install time, so
 * users who never turn the feature on never fetch the binary.
 *
 * Packagers (Docker, apt, Synology) can point UIX_CLOUDFLARED_BIN at a binary
 * they ship instead.
 */
export async function ensureCloudflaredBinary(binDir: string): Promise<string> {
  if (process.env.UIX_CLOUDFLARED_BIN) {
    return process.env.UIX_CLOUDFLARED_BIN
  }

  const asset = cloudflaredAssetName()
  if (!asset) {
    throw new Error(`cloudflared is not available for ${process.platform}/${process.arch}.`)
  }

  const target = join(binDir, `cloudflared-${CLOUDFLARED_VERSION}${process.platform === 'win32'
    ? '.exe'
    : ''}`)
  if (await pathExists(target)) {
    return target
  }

  await ensureDir(binDir)

  // Download to a temporary name and rename once complete, so an interrupted
  // download never leaves a truncated binary at the final path.
  const tmp = join(binDir, `.download-${randomBytes(6).toString('hex')}`)
  try {
    const res = await axios.get(`${RELEASE_BASE}/${CLOUDFLARED_VERSION}/${asset}`, {
      responseType: 'stream',
      timeout: 60_000,
      maxRedirects: 5,
    })
    await pipeline(res.data, createWriteStream(tmp, { mode: 0o700 }))

    if (asset.endsWith('.tgz')) {
      const extractDir = `${tmp}-x`
      await ensureDir(extractDir)
      try {
        await extract({
          file: tmp,
          cwd: extractDir,
          filter: path => basename(path) === 'cloudflared',
        })
        await rename(join(extractDir, 'cloudflared'), target)
      } finally {
        await rm(extractDir, { recursive: true, force: true })
      }
    } else {
      await rename(tmp, target)
    }

    if (process.platform !== 'win32') {
      await chmod(target, 0o755)
    }
  } finally {
    await rm(tmp, { force: true })
  }

  await removeStaleBinaries(binDir, basename(target))
  return target
}

/**
 * Remove binaries left behind by earlier pinned versions.
 */
async function removeStaleBinaries(binDir: string, keep: string) {
  for (const entry of await readdir(binDir)) {
    if (entry.startsWith('cloudflared-') && entry !== keep) {
      await rm(join(binDir, entry), { force: true })
    }
  }
}

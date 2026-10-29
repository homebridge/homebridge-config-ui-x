import Buffer from 'node:buffer'
import { ChildProcess, spawn } from 'node:child_process'
import * as path from 'node:path'
import process from 'node:process'

import { Injectable, Logger } from '@nestjs/common'
import { bin, install } from 'cloudflared'
import fs from 'fs-extra'

export interface DirectConnectionConfig {
  enabled: boolean
  externalUrl: string
  connectionMethod: 'cloudflare'
  cloudflareVariant: 'named-tunnel-oauth' | 'quick-tunnel'
  hostname: string
  tunnelId: string
  tunnelToken?: string
  isLoggedIn?: boolean
}

@Injectable()
export class DirectConnectionService {
  private readonly logger = new Logger(DirectConnectionService.name)
  private cloudflaredProcess: ChildProcess | null = null
  private configFilePath = path.join(process.env.UI_CONFIG_DIR || '', 'direct-connection.json')

  async getConfig(): Promise<any> {
    let config: any = {
      enabled: false,
      externalUrl: '',
      connectionMethod: 'cloudflare',
      cloudflareVariant: 'named-tunnel-oauth',
      hostname: '',
      tunnelId: '',
    }

    try {
      if (await fs.pathExists(this.configFilePath)) {
        config = await fs.readJson(this.configFilePath)
      }
    } catch (e) {
      this.logger.error('Failed to read direct-connection config', e)
    }

    const certPath = path.join(process.env.HOME || process.env.USERPROFILE || '', '.cloudflared', 'cert.pem')
    const isLoggedIn = await fs.pathExists(certPath)

    return {
      ...config,
      isLoggedIn,
    }
  }

  async saveConfig(config: DirectConnectionConfig): Promise<DirectConnectionConfig> {
    let finalConfig = { ...config }

    const certPath = path.join(process.env.HOME || process.env.USERPROFILE || '', '.cloudflared', 'cert.pem')
    const isLoggedIn = await fs.pathExists(certPath)

    if (isLoggedIn && finalConfig.enabled && finalConfig.hostname) {
      finalConfig = await this.startTunnel(finalConfig)
    } else {
      finalConfig.enabled = false
      this.stopTunnel()
      await fs.outputJson(this.configFilePath, finalConfig, { spaces: 2 })
    }

    return {
      ...finalConfig,
      isLoggedIn,
    }
  }

  async startLogin(): Promise<{ success: boolean, message: string, url?: string }> {
    try {
      const cloudflaredBin = await this.ensureBinary()
      const certPath = path.join(process.env.HOME || process.env.USERPROFILE || '', '.cloudflared', 'cert.pem')

      if (await fs.pathExists(certPath)) {
        return {
          success: true,
          message: 'Already authenticated with Cloudflare! You can now create your tunnel.',
        }
      }

      return new Promise((resolve) => {
        const proc = spawn(cloudflaredBin, ['tunnel', 'login'])
        let resolved = false
        let outputBuffer = ''

        const handleData = (data: Buffer) => {
          const text = data.toString()
          outputBuffer += text
          const match = outputBuffer.match(/https:\/\/\S*dash\.cloudflare\.com\S*|https:\/\/\S*cloudflareaccess\.org\S*/)
          if (match && !resolved) {
            resolved = true
            resolve({
              success: true,
              message: 'Cloudflare login URL generated.',
              url: match[0].trim().replace(/['"].*$/, ''),
            })
          }
        }

        proc.stdout?.on('data', handleData)
        proc.stderr?.on('data', handleData)

        setTimeout(() => {
          if (!proc.killed) {
            proc.kill()
          }
        }, 120000)
      })
    } catch (e: any) {
      return { success: false, message: `Failed to initialize: ${e?.message || e}` }
    }
  }

  async ensureBinary(): Promise<string> {
    if (!fs.existsSync(bin)) {
      this.logger.log('Downloading and installing cloudflared binary...')
      await install(bin)
    }
    return bin
  }

  private extractTunnelId(text: string): string | null {
    const match = text.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)
    return match ? match[0] : null
  }

  private async getTunnelIdByName(cloudflaredBin: string, tunnelName: string): Promise<string | null> {
    return new Promise((resolve) => {
      const proc = spawn(cloudflaredBin, [
        'tunnel',
        'list',
        '--name',
        tunnelName,
        '--output',
        'json',
      ])
      let buffer = ''
      proc.stdout?.on('data', (d) => {
        buffer += d.toString()
      })
      proc.stderr?.on('data', (d) => {
        buffer += d.toString()
      })
      proc.on('close', () => {
        try {
          const tunnels = JSON.parse(buffer)
          if (Array.isArray(tunnels) && tunnels.length > 0) {
            resolve(tunnels[0].id || tunnels[0].UUID)
            return
          }
        } catch (e) {
          // Fallback if JSON parsing fails
        }
        resolve(this.extractTunnelId(buffer))
      })
    })
  }

  async startTunnel(config: DirectConnectionConfig): Promise<DirectConnectionConfig> {
    this.stopTunnel()
    const updatedConfig = { ...config }

    try {
      const cloudflaredBin = await this.ensureBinary()
      if (config.cloudflareVariant === 'named-tunnel-oauth' && config.hostname) {
        const tunnelName = config.hostname.replace(/[^a-z0-9-]/gi, '-')
        this.logger.log(`Ensuring named tunnel exists: ${tunnelName}`)

        const tunnelId = await new Promise<string | null>((resolve) => {
          const createProc = spawn(cloudflaredBin, ['tunnel', 'create', tunnelName])
          let outputBuffer = ''
          createProc.stdout?.on('data', (d) => {
            outputBuffer += d.toString()
          })
          createProc.stderr?.on('data', (d) => {
            outputBuffer += d.toString()
          })
          createProc.on('close', async () => {
            let id = this.extractTunnelId(outputBuffer)
            if (!id) {
              id = await this.getTunnelIdByName(cloudflaredBin, tunnelName)
            }
            resolve(id)
          })
        })

        let yamlConfigPath = ''
        if (tunnelId) {
          updatedConfig.tunnelId = tunnelId
          await fs.outputJson(this.configFilePath, updatedConfig, { spaces: 2 })
          this.logger.log(`Assigned and saved Tunnel ID: ${tunnelId}`)

          // Create DNS route
          this.logger.log(`Routing DNS for ${config.hostname}...`)
          await new Promise<void>((resolve) => {
            const routeProc = spawn(cloudflaredBin, ['tunnel', 'route', 'dns', '-f', tunnelName, config.hostname])
            routeProc.on('close', () => resolve())
          })

          // Generate local config.yml for local tunnel management & ingress routing
          const cloudflaredDir = path.join(process.env.HOME || process.env.USERPROFILE || '', '.cloudflared')
          await fs.ensureDir(cloudflaredDir)
          const credsPath = path.join(cloudflaredDir, `${tunnelId}.json`)
          yamlConfigPath = path.join(cloudflaredDir, 'config.yml')

          const uiPort = process.env.HOMEBRIDGE_CONFIG_UI_PORT || '8581'
          const yamlContent = `tunnel: ${tunnelId}
credentials-file: ${credsPath}
ingress:
  - hostname: ${config.hostname}
    service: http://localhost:${uiPort}
  - service: http_status:404
`
          await fs.outputFile(yamlConfigPath, yamlContent)
          this.logger.log(`Generated local tunnel config at ${yamlConfigPath}`)
        }

        // --- CRITICAL FIX: Ensure --config flag is passed to cloudflared ---
        const cloudflaredDir = path.join(process.env.HOME || process.env.USERPROFILE || '', '.cloudflared')
        const configPath = yamlConfigPath || path.join(cloudflaredDir, 'config.yml')

        const spawnArgs = ['tunnel']
        if (await fs.pathExists(configPath)) {
          spawnArgs.push('--config', configPath)
        }
        spawnArgs.push('run', tunnelName)

        this.logger.log(`Starting tunnel run with args: ${spawnArgs.join(' ')}`)
        this.cloudflaredProcess = spawn(cloudflaredBin, spawnArgs)

        this.cloudflaredProcess.stdout?.on('data', (data) => {
          this.logger.log(`[cloudflared] ${data.toString().trim()}`)
        })

        this.cloudflaredProcess.stderr?.on('data', (data) => {
          this.logger.debug(`[cloudflared] ${data.toString().trim()}`)
        })
      }
    } catch (e) {
      this.logger.error('Failed to start cloudflared tunnel', e)
    }

    return updatedConfig
  }

  stopTunnel() {
    if (this.cloudflaredProcess) {
      this.logger.log('Stopping Cloudflare direct connection tunnel...')
      this.cloudflaredProcess.kill('SIGTERM')
      this.cloudflaredProcess = null
    }
  }

  async logout(): Promise<void> {
    const certPath = path.join(process.env.HOME || process.env.USERPROFILE || '', '.cloudflared', 'cert.pem')
    if (await fs.pathExists(certPath)) {
      await fs.remove(certPath)
      this.logger.log('Removed Cloudflare certificate (cert.pem)')
    }
  }

  async testConnection(): Promise<{ success: boolean, message: string }> {
    try {
      const cloudflaredBin = await this.ensureBinary()
      return new Promise((resolve) => {
        const proc = spawn(cloudflaredBin, ['--version'])
        proc.on('error', () => {
          resolve({ success: false, message: 'Failed to execute cloudflared binary.' })
        })
        proc.on('exit', (code) => {
          if (code === 0) {
            resolve({ success: true, message: 'Cloudflare direct connection agent reachable.' })
          } else {
            resolve({ success: false, message: `cloudflared returned exit code ${code}` })
          }
        })
      })
    } catch (e) {
      return { success: false, message: 'Failed to install or locate cloudflared binary.' }
    }
  }
}

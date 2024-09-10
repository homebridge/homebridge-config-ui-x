import { execSync } from 'node:child_process'
import { arch } from 'node:os'
import { resolve } from 'node:path'
import process from 'node:process'

import axios from 'axios'
import { createWriteStream, pathExists, remove } from 'fs-extra'

import { BasePlatform } from '../base-platform'

export class Win32Installer extends BasePlatform {
  /**
   * Installs the Windows 10 Homebridge Service
   */
  public async install() {
    this.checkIsAdmin()
    await this.hbService.portCheck()
    await this.hbService.storagePathCheck()
    await this.hbService.configCheck()

    // download nssm.exe to help create the service
    const nssmPath: string = await this.downloadNssm()

    // commands to run
    const installCmd = `"${nssmPath}" install ${this.hbService.serviceName} `
      + `"${process.execPath}" "\""${this.hbService.selfPath}"\"" run -I -U "\""${this.hbService.storagePath}"\""`
    const setUserDirCmd = `"${nssmPath}" set ${this.hbService.serviceName} AppEnvironmentExtra ":UIX_STORAGE_PATH=${this.hbService.storagePath}"`

    try {
      execSync(installCmd)
      execSync(setUserDirCmd)
      await this.configureFirewall()
      await this.start()
      await this.hbService.printPostInstallInstructions()
    } catch (e) {
      console.error(e.toString())
      this.hbService.logger('ERROR: Failed Operation', 'fail')
    }
  }

  /**
   * Removes the Windows 10 Homebridge Service
   */
  public async uninstall() {
    this.checkIsAdmin()

    // stop existing service
    await this.stop()

    try {
      execSync(`sc delete ${this.hbService.serviceName}`)
      this.hbService.logger(`Removed ${this.hbService.serviceName} Service`, 'succeed')
    } catch (e) {
      console.error(e.toString())
      this.hbService.logger('ERROR: Failed Operation', 'fail')
    }
  }

  /**
   * Starts the Windows 10 Homebridge Service
   */
  public async start() {
    this.checkIsAdmin()

    try {
      this.hbService.logger(`Starting ${this.hbService.serviceName} Service...`)
      execSync(`sc start ${this.hbService.serviceName}`)
      this.hbService.logger(`${this.hbService.serviceName} Started`, 'succeed')
    } catch (e) {
      this.hbService.logger(`Failed to start ${this.hbService.serviceName}`, 'fail')
    }
  }

  /**
   * Stops the Windows 10 Homebridge Service
   */
  public async stop() {
    this.checkIsAdmin()

    try {
      this.hbService.logger(`Stopping ${this.hbService.serviceName} Service...`)
      execSync(`sc stop ${this.hbService.serviceName}`)
      this.hbService.logger(`${this.hbService.serviceName} Stopped`, 'succeed')
    } catch (e) {
      this.hbService.logger(`Failed to stop ${this.hbService.serviceName}`, 'fail')
    }
  }

  /**
   * Restarts the Windows 10 Homebridge Service
   */
  public async restart() {
    this.checkIsAdmin()
    await this.stop()
    setTimeout(async () => {
      await this.start()
    }, 4000)
  }

  /**
   * Rebuilds the Node.js modules for Homebridge UI
   */
  public async rebuild(all = false) { // eslint-disable-line unused-imports/no-unused-vars
    this.checkIsAdmin()

    try {
      execSync('npm rebuild --unsafe-perm', {
        cwd: process.env.UIX_BASE_PATH,
        stdio: 'inherit',
      })

      this.hbService.logger(`Rebuilt modules in ${process.env.UIX_BASE_PATH} for Node.js ${process.version}.`, 'succeed')
    } catch (e) {
      console.error(e.toString())
      this.hbService.logger('ERROR: Failed Operation', 'fail')
    }
  }

  /**
   * Update Node.js
   */
  public async updateNodejs(job: { target: string, rebuild: boolean }) {
    this.hbService.logger('ERROR: This command is not supported on Windows.', 'fail')
    this.hbService.logger(`Please download Node.js v${job.target} from https://nodejs.org/en/download/ and install manually.`, 'fail')
  }

  /**
   * Checks if the current user is an admin
   */
  private checkIsAdmin() {
    try {
      execSync('fsutil dirty query %systemdrive% >nul')
    } catch (e) {
      this.hbService.logger('ERROR: This command must be run as an Administrator', 'fail')
      this.hbService.logger('Node.js command prompt shortcut -> Right Click -> Run as administrator', 'fail')
      process.exit(1)
    }
  }

  /**
   * Windows Only!
   * Downloads nssm - NSSM - the Non-Sucking Service Manager - https://nssm.cc/
   * This is used to create the Windows Services
   */
  private async downloadNssm(): Promise<string> {
    const downloadUrl = `https://github.com/homebridge/nssm/releases/download/2.24-101-g897c7ad/nssm_${arch()}.exe`
    const nssmPath = resolve(this.hbService.storagePath, 'nssm.exe')

    if (await pathExists(nssmPath)) {
      return nssmPath
    }

    const nssmFile = createWriteStream(nssmPath)

    this.hbService.logger(`Downloading NSSM from ${downloadUrl}`)

    return new Promise((res, rej) => {
      axios({
        method: 'GET',
        url: downloadUrl,
        responseType: 'stream',
      }).then((response) => {
        response.data.pipe(nssmFile).on('finish', () => {
          return res(nssmPath)
        }).on('error', (err: any) => {
          return rej(err)
        })
      }).catch(async (e) => {
        // cleanup
        nssmFile.close()
        await remove(nssmPath)

        this.hbService.logger(`Failed to download nssm: ${e.message}`, 'fail')
        process.exit(0)
      })
    })
  }

  /**
   * Ensures the Node.js process is allowed to accept incoming connections
   */
  private async configureFirewall() {
    // firewall commands
    const cleanFirewallCmd = 'netsh advfirewall firewall Delete rule name="Homebridge"'
    const openFirewallCmd = `netsh advfirewall firewall add rule name="Homebridge" dir=in action=allow program="${process.execPath}"`

    // try and remove any existing rules so there are not any duplicates
    try {
      execSync(cleanFirewallCmd)
    } catch (e) {
      // this is probably ok, the firewall rule may not exist to remove
    }

    // create a new firewall rule
    try {
      execSync(openFirewallCmd)
    } catch (e) {
      this.hbService.logger('Failed to configure firewall rule for Homebridge.', 'warn')
      this.hbService.logger(e)
    }
  }
}

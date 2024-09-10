import { execSync } from 'node:child_process'

import { homedir, release, userInfo } from 'node:os'
import { dirname, resolve } from 'node:path'
import process from 'node:process'
import { existsSync, pathExists, remove, unlinkSync, writeFile } from 'fs-extra'

import { gte, lt } from 'semver'
import type { PathLike } from 'fs-extra'

import { BasePlatform } from '../base-platform'

export class DarwinInstaller extends BasePlatform {
  private user: string

  private get plistName() {
    return `com.${this.hbService.serviceName.toLowerCase()}.server`
  }

  private get plistPath() {
    return resolve('/Library/LaunchDaemons/', `${this.plistName}.plist`)
  }

  /**
   * Installs the launchctl service
   */
  public async install() {
    this.checkForRoot()
    this.fixStoragePath()
    await this.hbService.portCheck()
    await this.checkGlobalNpmAccess()
    await this.hbService.storagePathCheck()
    await this.hbService.configCheck()

    try {
      await this.createLaunchAgent()
      await this.start()
      await this.hbService.printPostInstallInstructions()
    } catch (e) {
      console.error(e.toString())
      this.hbService.logger('ERROR: Failed Operation', 'fail')
    }
  }

  /**
   * Removes the launchctl service
   */
  public async uninstall() {
    this.checkForRoot()
    await this.stop()

    try {
      if (existsSync(this.plistPath)) {
        this.hbService.logger(`Removed ${this.hbService.serviceName} Service`, 'succeed')
        unlinkSync(this.plistPath)
      } else {
        this.hbService.logger(`Could not find installed ${this.hbService.serviceName} Service.`, 'fail')
      }
    } catch (e) {
      console.error(e.toString())
      this.hbService.logger('ERROR: Failed Operation', 'fail')
    }
  }

  /**
   * Starts the launchctl service
   */
  public async start() {
    this.checkForRoot()
    try {
      this.hbService.logger(`Starting ${this.hbService.serviceName} Service...`)
      execSync(`launchctl load -w ${this.plistPath}`)
      this.hbService.logger(`${this.hbService.serviceName} Started`, 'succeed')
    } catch (e) {
      this.hbService.logger(`Failed to start ${this.hbService.serviceName}`, 'fail')
    }
  }

  /**
   * Stops the launchctl service
   */
  public async stop() {
    this.checkForRoot()
    try {
      this.hbService.logger(`Stopping ${this.hbService.serviceName} Service...`)
      execSync(`launchctl unload -w ${this.plistPath}`)
      this.hbService.logger(`${this.hbService.serviceName} Stopped`, 'succeed')
    } catch (e) {
      this.hbService.logger(`Failed to stop ${this.hbService.serviceName}`, 'fail')
    }
  }

  /**
   * Restarts the launchctl service
   */
  public async restart() {
    this.checkForRoot()
    await this.stop()
    setTimeout(async () => {
      await this.start()
    }, 2000)
  }

  /**
   * Rebuilds the Node.js modules for Homebridge UI
   */
  public async rebuild(all = false) {
    try {
      if (!this.isPackage()) {
        this.checkForRoot() // do not need root in package mode
      }

      const targetNodeVersion = execSync('node -v').toString('utf8').trim()

      const npmGlobalPath = execSync('/bin/echo -n "$(npm -g prefix)/lib/node_modules"', {
        env: Object.assign({
          npm_config_loglevel: 'silent',
          npm_update_notifier: 'false',
        }, process.env),
      }).toString('utf8')

      execSync('npm rebuild --unsafe-perm', {
        cwd: process.env.UIX_BASE_PATH,
        stdio: 'inherit',
      })
      this.hbService.logger(`Rebuilt homebridge-config-ui-x for Node.js ${targetNodeVersion}.`, 'succeed')

      if (all === true) {
        // rebuild all modules
        try {
          execSync('npm rebuild --unsafe-perm', {
            cwd: npmGlobalPath,
            stdio: 'inherit',
          })
          this.hbService.logger(`Rebuilt plugins in ${npmGlobalPath} for Node.js ${targetNodeVersion}.`, 'succeed')
        } catch (e) {
          this.hbService.logger('Could not rebuild all modules - check Homebridge logs.', 'warn')
        }
      }

      await this.setNpmPermissions(npmGlobalPath)
    } catch (e) {
      console.error(e.toString())
      this.hbService.logger('ERROR: Failed Operation', 'fail')
    }
  }

  /**
   * Returns the users uid and gid.
   */
  public async getId(): Promise<{ uid: number, gid: number }> {
    if ((process.getuid() === 0 && this.hbService.asUser) || process.env.SUDO_USER) {
      const uid = execSync(`id -u ${this.hbService.asUser || process.env.SUDO_USER}`).toString('utf8')
      const gid = execSync(`id -g ${this.hbService.asUser || process.env.SUDO_USER}`).toString('utf8')
      return {
        uid: Number.parseInt(uid, 10),
        gid: Number.parseInt(gid, 10),
      }
    } else {
      return {
        uid: userInfo().uid,
        gid: userInfo().gid,
      }
    }
  }

  /**
   * Returns the pid of the process running on the defined port
   */
  public getPidOfPort(port: number) {
    try {
      return execSync(`lsof -n -iTCP:${port} -sTCP:LISTEN -t 2> /dev/null`).toString('utf8').trim()
    } catch (e) {
      return null
    }
  }

  /**
   * Check the command is being run as root and we can detect the user
   */
  private checkForRoot() {
    if (process.getuid() !== 0) {
      this.hbService.logger('ERROR: This command must be executed using sudo on macOS', 'fail')
      this.hbService.logger(`sudo hb-service ${this.hbService.action}`, 'fail')
      process.exit(1)
    }
    if (!process.env.SUDO_USER && !this.hbService.asUser) {
      this.hbService.logger('ERROR: Could not detect user. Pass in the user you want to run Homebridge as using the --user flag eg.', 'fail')
      this.hbService.logger(`sudo hb-service ${this.hbService.action} --user your-user`, 'fail')
      process.exit(1)
    }
    this.user = this.hbService.asUser || process.env.SUDO_USER
  }

  /**
   * Fix the storage path when running the installer as root
   */
  private fixStoragePath() {
    if (!this.hbService.usingCustomStoragePath) {
      this.hbService.storagePath = resolve(this.getUserHomeDir(), `.${this.hbService.serviceName.toLowerCase()}`)
    }
  }

  /**
   * Resolves the target user home directory when running the installation command as SUDO
   */
  private getUserHomeDir() {
    try {
      const realHomeDir = execSync(`eval echo "~${this.user}"`).toString('utf8').trim()
      if (realHomeDir.charAt(0) === '~') {
        throw new Error('Could not resolve user home directory')
      }
      return realHomeDir
    } catch (e) {
      return homedir()
    }
  }

  /**
   * Update Node.js
   */
  public async updateNodejs(job: { target: string, rebuild: boolean }) {
    this.checkForRoot()

    if (!['x64', 'arm64'].includes(process.arch)) {
      this.hbService.logger(`Architecture not supported: ${process.arch}.`, 'fail')
      process.exit(1)
    }

    if (process.arch === 'arm64' && lt(job.target, '18.0.0')) {
      this.hbService.logger('macOS M1 / arm64 support is only available from Node.js v18 or later', 'fail')
      process.exit(1)
    }

    // Node.js 18+ requires macOS 10.15 or later, which starts with Darwin 19.0.0
    if (lt(release(), '19.0.0') && gte(job.target, '18.0.0')) {
      this.hbService.logger('macOS Catalina 10.15 or later is required to install Node.js v18 or later', 'fail')
      process.exit(1)
    }

    const downloadUrl = `https://nodejs.org/dist/${job.target}/node-${job.target}-darwin-${process.arch}.tar.gz`
    const targetPath = dirname(dirname(process.execPath))

    // only allow updates when installed using the official Node.js installer / Homebridge package
    if (targetPath !== '/usr/local' && !targetPath.startsWith('/Library/Application Support/Homebridge/node-')) {
      this.hbService.logger(`Cannot update Node.js on your system. Non-standard installation path detected: ${targetPath}`, 'fail')
      process.exit(1)
    }

    this.hbService.logger(`Target: ${targetPath}`)

    try {
      const archivePath = await this.hbService.downloadNodejs(downloadUrl)

      const extractConfig = {
        file: archivePath,
        cwd: targetPath,
        strip: 1,
        preserveOwner: false,
        unlink: true,
      }

      // remove npm package as this can cause issues when overwritten by the node tarball
      await this.hbService.removeNpmPackage(resolve(targetPath, 'lib', 'node_modules', 'npm'))

      // extract
      await this.hbService.extractNodejs(job.target, extractConfig)

      // clean up
      await remove(archivePath)

      // rebuild / fix perms
      await this.rebuild(true)

      // restart
      if (await pathExists(this.plistPath)) {
        await this.restart()
      } else {
        this.hbService.logger('Please restart Homebridge for the changes to take effect.', 'warn')
      }
    } catch (e) {
      this.hbService.logger(`Failed to update Node.js: ${e.message}`, 'fail')
      process.exit(1)
    }
  }

  /**
   * Checks if the user has write access to the global npm directory
   */
  private async checkGlobalNpmAccess() {
    const npmGlobalPath = execSync('/bin/echo -n "$(npm -g prefix)/lib/node_modules"', {
      env: Object.assign({
        npm_config_loglevel: 'silent',
        npm_update_notifier: 'false',
      }, process.env),
    }).toString('utf8')
    const { uid, gid } = await this.getId()

    try {
      execSync(`test -w "${npmGlobalPath}"`, {
        uid,
        gid,
      })
      execSync('test -w "$(dirname $(which npm))"', {
        uid,
        gid,
      })
    } catch (e) {
      await this.setNpmPermissions(npmGlobalPath)
    }
  }

  /**
   * Set permissions on global npm path
   */
  private async setNpmPermissions(npmGlobalPath: PathLike) {
    if (this.isPackage()) {
      return // we don't need to check this in package mode
    }
    try {
      execSync(`chown -R ${this.user}:admin "${npmGlobalPath}"`)
      execSync(`chown -R ${this.user}:admin "$(dirname $(which npm))"`)
    } catch (e) {
      this.hbService.logger(`ERROR: User "${this.user}" does not have write access to the global npm modules path.`, 'fail')
      this.hbService.logger('You can fix this issue by running the following commands:', 'fail')

      /* eslint-disable no-console */
      console.log('')
      console.log(`sudo chown -R ${this.user}:admin "${npmGlobalPath}"`)
      console.log(`sudo chown -R ${this.user}:admin "$(dirname $(which npm))"`)
      console.log('')
      /* eslint-enable no-console */

      this.hbService.logger('Once you have done this run the hb-service install command again to complete your installation.', 'fail')
      process.exit(1)
    }
  }

  /**
   * Determines if the command is being run inside the macOS Package
   */
  private isPackage(): boolean {
    return (
      Boolean(process.env.HOMEBRIDGE_MACOS_PACKAGE === '1')
    )
  }

  /**
   * Create the system launch agent
   */
  private async createLaunchAgent() {
    const plistFileContents = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">',
      '<plist version="1.0">',
      '<dict>',
      '    <key>RunAtLoad</key>',
      '        <true/>',
      '    <key>KeepAlive</key>',
      '        <true/>',
      '    <key>Label</key>',
      `        <string>${this.plistName}</string>`,
      '    <key>ProgramArguments</key>',
      '        <array>',
      `             <string>${process.execPath}</string>`,
      `             <string>${this.hbService.selfPath}</string>`,
      '             <string>run</string>',
      '             <string>-I</string>',
      '             <string>-U</string>',
      `             <string>${this.hbService.storagePath}</string>`,
      '        </array>',
      '    <key>WorkingDirectory</key>',
      `         <string>${this.hbService.storagePath}</string>`,
      '    <key>StandardOutPath</key>',
      `        <string>${this.hbService.storagePath}/homebridge.log</string>`,
      '    <key>StandardErrorPath</key>',
      `        <string>${this.hbService.storagePath}/homebridge.log</string>`,
      '    <key>UserName</key>',
      `        <string>${this.user}</string>`,
      '    <key>EnvironmentVariables</key>',
      '        <dict>',
      '            <key>PATH</key>',
      `                <string>${process.env.PATH}</string>`,
      '            <key>HOME</key>',
      `                <string>${this.getUserHomeDir()}</string>`,
      '            <key>UIX_STORAGE_PATH</key>',
      `                <string>${this.hbService.storagePath}</string>`,
      '        </dict>',
      '</dict>',
      '</plist>',
    ].filter(x => x).join('\n')

    await writeFile(this.plistPath, plistFileContents)
  }
}

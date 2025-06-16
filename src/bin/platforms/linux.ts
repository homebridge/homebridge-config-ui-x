import { execSync } from 'node:child_process'
import { userInfo } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import process from 'node:process'

import {
  chmod,
  existsSync,
  mkdirp,
  pathExists,
  readdir,
  readFileSync,
  readJson,
  remove,
  rm,
  unlinkSync,
  writeFile,
} from 'fs-extra'
import { gte, parse } from 'semver'
import { osInfo } from 'systeminformation'

import { BasePlatform } from '../base-platform'

export class LinuxInstaller extends BasePlatform {
  private get systemdServiceName() {
    return this.hbService.serviceName.toLowerCase()
  }

  private get systemdServicePath() {
    return resolve('/etc/systemd/system', `${this.systemdServiceName}.service`)
  }

  private get systemdEnvPath() {
    return resolve('/etc/default', this.systemdServiceName)
  }

  private get runPartsPath() {
    return resolve('/etc/hb-service', this.hbService.serviceName.toLowerCase(), 'prestart.d')
  }

  /**
   * Installs the systemd service
   */
  public async install() {
    this.checkForRoot()
    await this.checkUser()
    this.setupSudo()

    await this.hbService.portCheck()
    await this.hbService.storagePathCheck()
    await this.hbService.configCheck()

    try {
      await this.createSystemdEnvFile()
      await this.createSystemdService()
      await this.createRunPartsPath()
      await this.reloadSystemd()
      await this.enableService()
      await this.createFirewallRules()
      await this.start()
      await this.hbService.printPostInstallInstructions()
    } catch (e) {
      console.error(e.toString())
      this.hbService.logger('ERROR: Failed Operation', 'fail')
    }
  }

  public async uninstall() {
    this.checkForRoot()
    await this.stop()

    // Try and disable the service
    await this.disableService()

    try {
      if (existsSync(this.systemdServicePath)) {
        unlinkSync(this.systemdServicePath)
      }
      if (existsSync(this.systemdEnvPath)) {
        unlinkSync(this.systemdEnvPath)
      }

      // Reload services
      await this.reloadSystemd()

      this.hbService.logger(`Removed ${this.hbService.serviceName} Service`, 'succeed')
    } catch (e) {
      console.error(e.toString())
      this.hbService.logger('ERROR: Failed Operation', 'fail')
    }
  }

  /**
   * viewLogs the systemd service
   */
  public async viewLogs() {
    try {
      const ret = execSync(`journalctl -n 50 -u ${this.systemdServiceName} --no-pager`).toString()

      // eslint-disable-next-line no-console
      console.log(ret)
    } catch (e) {
      this.hbService.logger(`Failed to start ${this.hbService.serviceName} - ${e}`, 'fail')
    }
  }

  /**
   * Starts the systemd service
   */
  public async start() {
    this.checkForRoot()
    this.fixPermissions()
    try {
      this.hbService.logger(`Starting ${this.hbService.serviceName} Service...`)
      execSync(`systemctl start ${this.systemdServiceName}`)
      execSync(`systemctl status ${this.systemdServiceName} --no-pager`)
    } catch (e) {
      this.hbService.logger(`Failed to start ${this.hbService.serviceName} - ${e}`, 'fail')
      process.exit(1)
    }
  }

  /**
   * Stops the systemd service
   */
  public async stop() {
    this.checkForRoot()
    try {
      this.hbService.logger(`Stopping ${this.hbService.serviceName} Service...`)
      execSync(`systemctl stop ${this.systemdServiceName}`)
      this.hbService.logger(`${this.hbService.serviceName} Stopped`, 'succeed')
    } catch (e) {
      this.hbService.logger(`Failed to stop ${this.systemdServiceName} - ${e}`, 'fail')
    }
  }

  /**
   * Restarts the systemd service
   */
  public async restart() {
    this.checkForRoot()
    this.fixPermissions()
    try {
      this.hbService.logger(`Restarting ${this.hbService.serviceName} Service...`)
      execSync(`systemctl restart ${this.systemdServiceName}`)
      execSync(`systemctl status ${this.systemdServiceName} --no-pager`)
      this.hbService.logger(`${this.hbService.serviceName} Restarted`, 'succeed')
    } catch (e) {
      this.hbService.logger(`Failed to restart ${this.hbService.serviceName} - ${e}`, 'fail')
    }
  }

  /**
   * Code to execute before the service is started - as root
   * Find failed npm install temporary directories and attempt to remove them
   */
  public async beforeStart() {
    if ([
      '/usr/local/lib/node_modules',
      '/usr/lib/node_modules',
    ].includes(dirname(process.env.UIX_BASE_PATH))) {
      // systemd has a 90-second default timeout in the pre-start jobs
      // Terminate this task after 60 seconds to be safe
      setTimeout(() => {
        process.exit(0)
      }, 60000)

      const modulesPath = dirname(process.env.UIX_BASE_PATH)
      const temporaryDirectoriesToClean = (await readdir(modulesPath)).filter((x) => {
        return x.startsWith('.homebridge-')
      })

      for (const directory of temporaryDirectoriesToClean) {
        const pathToRemove = join(modulesPath, directory)
        try {
          // eslint-disable-next-line no-console
          console.log('Removing stale temporary directory:', pathToRemove)
          await rm(pathToRemove, { recursive: true, force: true })
        } catch (e) {
          console.error('Failed to remove:', pathToRemove, e)
        }
      }
    }

    process.exit(0)
  }

  /**
   * Rebuilds the Node.js modules for Homebridge UI
   */
  public async rebuild(all = false) {
    try {
      if (this.isPackage()) {
        // Must not run as root in package mode
        this.checkIsNotRoot()
      } else {
        this.checkForRoot()
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
        // Rebuild all global node_modules
        try {
          execSync('npm rebuild --unsafe-perm', {
            cwd: npmGlobalPath,
            stdio: 'inherit',
          })
          this.hbService.logger(`Rebuilt plugins in ${npmGlobalPath} for Node.js ${targetNodeVersion}.`, 'succeed')
        } catch (e) {
          this.hbService.logger('Could not rebuild all plugins - check logs.', 'warn')
        }
      }
    } catch (e) {
      console.error(e.toString())
      this.hbService.logger('ERROR: Failed Operation', 'fail')
    }
  }

  /**
   * Returns the users uid and gid.
   */
  public async getId(): Promise<{ uid: number, gid: number }> {
    if (process.getuid() === 0 && this.hbService.asUser) {
      const uid = execSync(`id -u ${this.hbService.asUser}`).toString('utf8')
      const gid = execSync(`id -g ${this.hbService.asUser}`).toString('utf8')
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
      if (this.hbService.docker) {
        return execSync('pidof homebridge').toString('utf8').trim()
      } else {
        return execSync(`fuser ${port}/tcp 2>/dev/null`).toString('utf8').trim()
      }
    } catch (e) {
      return null
    }
  }

  /**
   * Update Node.js
   */
  public async updateNodejs(job: { target: string, rebuild: boolean }) {
    if (this.isPackage()) {
      // Must not run as root in package mode
      this.checkIsNotRoot()
    } else {
      this.checkForRoot()
    }

    // Check target path
    const targetPath = dirname(dirname(process.execPath))

    if (targetPath !== '/usr' && targetPath !== '/usr/local' && targetPath !== '/opt/homebridge' && !targetPath.endsWith('/@appstore/homebridge/app')) {
      this.hbService.logger(`Cannot update Node.js on your system. Non-standard installation path detected: ${targetPath}`, 'fail')
      process.exit(1)
    }

    if (targetPath === '/usr' && await pathExists('/etc/apt/sources.list.d/nodesource.list')) {
      // Update from nodesource
      await this.updateNodeFromNodesource(job)
    } else {
      // Update from tarball
      await this.updateNodeFromTarball(job, targetPath)
    }

    // Rebuild node modules if required
    if (job.rebuild) {
      this.hbService.logger(`Rebuilding for Node.js ${job.target}...`)
      await this.rebuild(true)
    }

    // Restart
    if (await pathExists(this.systemdServicePath)) {
      await this.restart()
    } else {
      this.hbService.logger('Please restart Homebridge for the changes to take effect.', 'warn')
    }
  }

  /**
   * Debian Version - Supplied GLIBC Version
   *
   *  9 - Stretch       2.24
   * 10 - Buster        2.28
   * 11 - Bullseye      2.31
   * 12 - Bookworm      2.36
   * 13 - Trixie
   *
   * NodeJS Version - Minimum GLIBC Version
   *
   *      18            2.28
   *      20            2.31
   */

  private async glibcVersionCheck(target: string) {
    const glibcVersion = Number.parseFloat(execSync('getconf GNU_LIBC_VERSION 2>/dev/null').toString().split('glibc')[1].trim())
    if (glibcVersion < 2.23) {
      this.hbService.logger('Your version of Linux does not meet the GLIBC version requirements to use this tool to upgrade Node.js. '
        + `Wanted: >=2.23. Installed: ${glibcVersion} - see https://homebridge.io/w/JJSun`, 'fail')
      process.exit(1)
    }
    if (gte(target, '18.0.0') && glibcVersion < 2.28) {
      this.hbService.logger('Your version of Linux does not meet the GLIBC version requirements to use this tool to upgrade Node.js. '
        + `Wanted: >=2.28. Installed: ${glibcVersion} - see https://homebridge.io/w/JJSun`, 'fail')
      process.exit(1)
    }
    if (gte(target, '20.0.0') && glibcVersion < 2.31) {
      this.hbService.logger('Your version of Linux does not meet the GLIBC version requirements to use this tool to upgrade Node.js. '
        + `Wanted: >=2.31. Installed: ${glibcVersion} - see https://homebridge.io/w/JJSun`, 'fail')
      process.exit(1)
    }
  }

  /**
   * Update Node.js from the tarball archives
   */
  private async updateNodeFromTarball(job: { target: string, rebuild: boolean }, targetPath: string) {
    try {
      if (process.env.HOMEBRIDGE_SYNOLOGY_PACKAGE === '1') {
        // Skip glibc version check on Synology DSM
        // We know node > 18 requires glibc > 2.28, while DSM 7 only has 2.27 at the moment
        if (gte(job.target, '18.0.0')) {
          this.hbService.logger('Cannot update Node.js on your system. Synology DSM 7 does not currently support Node.js 18 or later.', 'fail')
          process.exit(1)
        }
      } else {
        await this.glibcVersionCheck(job.target)
      }
    } catch (e) {
      const os = await osInfo()
      if (os.distro === 'Alpine Linux') {
        this.hbService.logger('Updating Node.js on Alpine Linux / Docker is not supported by this command.', 'fail')
        this.hbService.logger('To update Node.js you should pull down the latest version of the homebridge/homebridge Docker image.', 'fail')
      } else {
        this.hbService.logger('Updating Node.js using this tool is not supported on your version of Linux.')
      }
      process.exit(1)
    }

    const uname = execSync('uname -m').toString().trim()

    let downloadUrl: string
    switch (uname) {
      case 'x86_64':
        downloadUrl = `https://nodejs.org/dist/${job.target}/node-${job.target}-linux-x64.tar.gz`
        break
      case 'aarch64':
        // With the latest Raspberry Pi OS upgrades, the Raspberry Pi 4B now runs the 64-bit kernel, even on the 32-bit OS
        // https://github.com/homebridge/homebridge/issues/3349#issuecomment-1523832510
        if (execSync('getconf LONG_BIT')?.toString()?.trim() === '32') {
          downloadUrl = `https://nodejs.org/dist/${job.target}/node-${job.target}-linux-armv7l.tar.gz`
        } else { // + case '64':
          downloadUrl = `https://nodejs.org/dist/${job.target}/node-${job.target}-linux-arm64.tar.gz`
        }
        break
      case 'armv7l':
        downloadUrl = `https://nodejs.org/dist/${job.target}/node-${job.target}-linux-armv7l.tar.gz`
        break
      case 'armv6l':
        downloadUrl = `https://unofficial-builds.nodejs.org/download/release/${job.target}/node-${job.target}-linux-armv6l.tar.gz`
        break
      default:
        this.hbService.logger(`Architecture not supported: ${process.arch}.`, 'fail')
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

      // Remove npm package as this can cause issues when overwritten by the node tarball
      await this.hbService.removeNpmPackage(resolve(targetPath, 'lib', 'node_modules', 'npm'))

      // Extract
      await this.hbService.extractNodejs(job.target, extractConfig)

      // Clean up
      await remove(archivePath)
    } catch (e) {
      this.hbService.logger(`Failed to update Node.js: ${e.message}`, 'fail')
      process.exit(1)
    }
  }

  /**
   * Update the NodeSource repo and use it to update Node.js
   */
  private async updateNodeFromNodesource(job: { target: string, rebuild: boolean }) {
    this.hbService.logger('Updating from NodeSource...')

    try {
      await this.glibcVersionCheck(job.target)
      const majorVersion = parse(job.target).major
      // Update apt (and accept release info changes)
      execSync('apt-get update --allow-releaseinfo-change && sudo apt-get install -y ca-certificates curl gnupg', {
        stdio: 'inherit',
      })

      // Update certificates
      execSync('mkdir -p /etc/apt/keyrings', {
        stdio: 'inherit',
      })

      execSync('curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | sudo gpg --dearmor --yes -o /etc/apt/keyrings/nodes', {
        stdio: 'inherit',
      })

      // Clean up old nodesource keyring
      if (await pathExists('/usr/share/keyrings/nodesource.gpg')) {
        execSync('rm -f /usr/share/keyrings/nodesource.gpg', {
          stdio: 'inherit',
        })
      }

      // Update repo
      execSync(`echo "deb [signed-by=/etc/apt/keyrings/nodes] https://deb.nodesource.com/node_${majorVersion}.x nodistro main" | sudo tee /etc/apt/sources.list.d/nodesource.list`, {
        stdio: 'inherit',
      })

      // Remove current node.js if downgrading
      if (majorVersion < parse(process.version).major) {
        execSync('apt-get remove -y nodejs', {
          stdio: 'inherit',
        })
      }

      // Update node.js
      execSync('apt-get update && apt-get install -y nodejs', {
        stdio: 'inherit',
      })
    } catch (e) {
      this.hbService.logger(`Failed to update Node.js: ${e.message}`, 'fail')
      process.exit(1)
    }
  }

  /**
   * Reloads systemd
   */
  private async reloadSystemd() {
    try {
      execSync('systemctl daemon-reload')
    } catch (e) {
      this.hbService.logger('WARNING: failed to run "systemctl daemon-reload"', 'warn')
    }
  }

  /**
   * Enables systemd service for autostart
   */
  private async enableService() {
    try {
      execSync(`systemctl enable ${this.systemdServiceName} 2> /dev/null`)
    } catch (e) {
      this.hbService.logger(`WARNING: failed to run "systemctl enable ${this.systemdServiceName}"`, 'warn')
    }
  }

  /**
   * Enables systemd service for autostart
   */
  private async disableService() {
    try {
      execSync(`systemctl disable ${this.systemdServiceName} 2> /dev/null`)
    } catch (e) {
      this.hbService.logger(`WARNING: failed to run "systemctl disable ${this.systemdServiceName}"`, 'warn')
    }
  }

  /**
   * Check the command is being run as root and we can detect the user
   */
  private checkForRoot() {
    if (this.isPackage()) {
      this.hbService.logger('ERROR: This command is not available.', 'fail')
      process.exit(1)
    }
    if (process.getuid() !== 0) {
      this.hbService.logger('ERROR: This command must be executed using sudo on Linux', 'fail')
      this.hbService.logger(`EXAMPLE: sudo hb-service ${this.hbService.action}`, 'fail')
      process.exit(1)
    }
    if (this.hbService.action === 'install' && !this.hbService.asUser) {
      this.hbService.logger('ERROR: User parameter missing. Pass in the user you want to run Homebridge as using the --user flag eg.', 'fail')
      this.hbService.logger(`EXAMPLE: sudo hb-service ${this.hbService.action} --user your-user`, 'fail')
      process.exit(1)
    }
  }

  /**
   * Check the current user is NOT root
   */
  private checkIsNotRoot() {
    if (process.getuid() === 0 && !this.hbService.allowRunRoot && process.env.HOMEBRIDGE_CONFIG_UI !== '1') {
      this.hbService.logger('ERROR: This command must not be executed as root or with sudo', 'fail')
      this.hbService.logger('ERROR: If you know what you are doing; you can override this by adding --allow-root', 'fail')
      process.exit(1)
    }
  }

  /**
   * Checks the user exists
   */
  private async checkUser() {
    try {
      // Check if user exists
      execSync(`id ${this.hbService.asUser} 2> /dev/null`)
    } catch (e) {
      // If not create the user
      execSync(`useradd -m --system ${this.hbService.asUser}`)
      this.hbService.logger(`Created service user: ${this.hbService.asUser}`, 'info')
      if (this.hbService.addGroup) {
        execSync(`usermod -a -G ${this.hbService.addGroup} ${this.hbService.asUser}`, { timeout: 10000 })
        this.hbService.logger(`Added ${this.hbService.asUser} to group ${this.hbService.addGroup}`, 'info')
      }
    }

    try {
      // Try and add the user to commonly required groups if on Raspbian
      const os = await osInfo()
      if (os.distro === 'Raspbian GNU/Linux') {
        execSync(`usermod -a -G audio,bluetooth,dialout,gpio,video ${this.hbService.asUser} 2> /dev/null`)
        execSync(`usermod -a -G input,i2c,spi ${this.hbService.asUser} 2> /dev/null`)
      }
    } catch (e) {
      // Do nothing
    }
  }

  /**
   * Allows the homebridge user to shut down and restart the server from the UI
   * There is no need for full sudo access when running using hb-service
   */
  private setupSudo() {
    try {
      const npmPath = execSync('which npm').toString('utf8').trim()
      const shutdownPath = execSync('which shutdown').toString('utf8').trim()
      const sudoersEntry = `${this.hbService.asUser}    ALL=(ALL) NOPASSWD:SETENV: ${shutdownPath}, ${npmPath}, /usr/bin/npm, /usr/local/bin/npm`

      // Check if the sudoers file already contains the entry
      const sudoers = readFileSync('/etc/sudoers', 'utf-8')
      if (sudoers.includes(sudoersEntry)) {
        return
      }

      // Grant the user restricted sudo privileges to /sbin/shutdown
      execSync(`echo '${sudoersEntry}' | sudo EDITOR='tee -a' visudo`)
    } catch (e) {
      this.hbService.logger('WARNING: Failed to setup /etc/sudoers, you may not be able to shutdown/restart your server from the Homebridge UI.', 'warn')
    }
  }

  /**
   * Determines if the command is being run inside the Synology DSM SPK Package / Debian Package
   */
  private isPackage(): boolean {
    return (
      Boolean(process.env.HOMEBRIDGE_SYNOLOGY_PACKAGE === '1')
      || Boolean(process.env.HOMEBRIDGE_APT_PACKAGE === '1')
    )
  }

  /**
   * Fixes the permission on the storage path
   */
  private fixPermissions() {
    if (existsSync(this.systemdServicePath) && existsSync(this.systemdEnvPath)) {
      try {
        // Extract the user this process is running as
        const serviceUser = execSync(`cat "${this.systemdServicePath}" | grep "User=" | awk -F'=' '{print $2}'`)
          .toString('utf8')
          .trim()

        // Get the storage path (we may not know it when running the start command)
        const storagePath = execSync(`cat "${this.systemdEnvPath}" | grep "UIX_STORAGE_PATH" | awk -F'=' '{print $2}' | sed -e 's/^"//' -e 's/"$//'`)
          .toString('utf8')
          .trim()

        if (storagePath.length > 5 && existsSync(storagePath)) {
          // Chown the storage directory to the service user
          execSync(`chown -R ${serviceUser}: "${storagePath}"`)
        }
        execSync(`chmod a+x ${this.hbService.selfPath}`)
      } catch (e) {
        this.hbService.logger('WARNING: Failed to set permissions', 'warn')
      }
    }
  }

  /**
   * Opens the port in the firewall if required
   */
  private async createFirewallRules() {
    // Check ufw is present on the system (debian based linux)
    if (await pathExists('/usr/sbin/ufw')) {
      return await this.createUfwRules()
    }

    // Check firewall-cmd is present on the system (enterprise linux)
    if (await pathExists('/usr/bin/firewall-cmd')) {
      return await this.createFirewallCmdRules()
    }
  }

  /**
   * Use ufw to create firewall rules
   * ufw is used on ubuntu based systems
   */
  private async createUfwRules() {
    try {
      // Check the firewall is active before doing anything
      const status = execSync('/bin/echo -n "$(ufw status)" 2> /dev/null').toString('utf8')
      if (!status.includes('Status: active')) {
        return
      }

      // Load the current config to get the Homebridge port
      const currentConfig = await readJson(process.env.UIX_CONFIG_PATH)
      const bridgePort = currentConfig.bridge?.port

      // Add ui rule
      execSync(`ufw allow ${this.hbService.uiPort}/tcp 2> /dev/null`)
      this.hbService.logger(`Added firewall rule to allow inbound traffic on port ${this.hbService.uiPort}/tcp`, 'info')

      // Add bridge rule
      if (bridgePort) {
        execSync(`ufw allow ${bridgePort}/tcp 2> /dev/null`)
        this.hbService.logger(`Added firewall rule to allow inbound traffic on port ${bridgePort}/tcp`, 'info')
      }
    } catch (e) {
      this.hbService.logger('WARNING: failed to allow ports through firewall.', 'warn')
    }
  }

  /**
   * User firewall-cmd to create firewall rules
   * firewall-cmd is used on enterprise / centos / fedora linux
   */
  private async createFirewallCmdRules() {
    try {
      // Check the firewall is running before doing anything
      const status = execSync('/bin/echo -n "$(firewall-cmd --state)" 2> /dev/null').toString('utf8')
      if (status !== 'running') {
        return
      }
      // Load the current config to get the Homebridge port
      const currentConfig = await readJson(process.env.UIX_CONFIG_PATH)
      const bridgePort = currentConfig.bridge?.port

      // Add ui rule
      execSync(`firewall-cmd --permanent --add-port=${this.hbService.uiPort}/tcp 2> /dev/null`)
      this.hbService.logger(`Added firewall rule to allow inbound traffic on port ${this.hbService.uiPort}/tcp`, 'info')

      // Add bridge rule
      if (bridgePort) {
        execSync(`firewall-cmd --permanent --add-port=${bridgePort}/tcp 2> /dev/null`)
        this.hbService.logger(`Added firewall rule to allow inbound traffic on port ${bridgePort}/tcp`, 'info')
      }

      // Reload the firewall
      execSync('firewall-cmd --reload 2> /dev/null')
      this.hbService.logger('Firewall reloaded', 'info')
    } catch (e) {
      this.hbService.logger('WARNING: failed to allow ports through firewall.', 'warn')
    }
  }

  /**
   * Set up the run-parts path and scripts
   * This allows users to define their own scripts to run before Homebridge starts/restarts
   * The default script will ensure the homebridge storage path has the correct permissions each time Homebridge starts
   */
  private async createRunPartsPath() {
    await mkdirp(this.runPartsPath)

    const permissionScriptPath = resolve(this.runPartsPath, '10-fix-permissions')
    const permissionScript = [
      '#!/bin/sh',
      '',
      '# Ensure the storage path permissions are correct',
      'if [ -n "$UIX_STORAGE_PATH" ] && [ -n "$USER" ]; then',
      '  echo "Ensuring $UIX_STORAGE_PATH is owned by $USER"',
      '  [ -d $UIX_STORAGE_PATH ] || mkdir -p $UIX_STORAGE_PATH',
      '  chown -R $USER: $UIX_STORAGE_PATH',
      'fi',
    ].filter(x => x !== null).join('\n')

    await writeFile(permissionScriptPath, permissionScript)
    await chmod(permissionScriptPath, '755')
  }

  /**
   * Create the systemd environment file
   */
  private async createSystemdEnvFile() {
    const envFile = [
      `HOMEBRIDGE_OPTS=-I -U "${this.hbService.storagePath}"`,
      `UIX_STORAGE_PATH="${this.hbService.storagePath}"`,
      '',
      '# To enable web terminals via homebridge-config-ui-x uncomment the following line',
      'HOMEBRIDGE_CONFIG_UI_TERMINAL=1',
      '',
      'DISABLE_OPENCOLLECTIVE=true',
    ].filter(x => x !== null).join('\n')

    await writeFile(this.systemdEnvPath, envFile)
  }

  /**
   * Create the systemd service file
   */
  private async createSystemdService() {
    const serviceFile = [
      '[Unit]',
      `Description=${this.hbService.serviceName}`,
      'Wants=network-online.target',
      'After=syslog.target network-online.target',
      '',
      '[Service]',
      'Type=simple',
      `User=${this.hbService.asUser}`,
      'PermissionsStartOnly=true',
      `WorkingDirectory=${this.hbService.storagePath}`,
      `EnvironmentFile=/etc/default/${this.systemdServiceName}`,
      `ExecStartPre=-/bin/run-parts ${this.runPartsPath}`,
      `ExecStartPre=-${this.hbService.selfPath} before-start $HOMEBRIDGE_OPTS`,
      `ExecStart=${this.hbService.selfPath} run $HOMEBRIDGE_OPTS`,
      'Restart=always',
      'RestartSec=3',
      'KillMode=process',
      'CapabilityBoundingSet=CAP_IPC_LOCK CAP_NET_ADMIN CAP_NET_BIND_SERVICE CAP_NET_RAW CAP_SETGID CAP_SETUID CAP_SYS_CHROOT CAP_CHOWN CAP_FOWNER CAP_DAC_OVERRIDE CAP_AUDIT_WRITE CAP_SYS_ADMIN',
      'AmbientCapabilities=CAP_NET_RAW CAP_NET_BIND_SERVICE',
      '',
      '[Install]',
      'WantedBy=multi-user.target',
    ].filter(x => x !== null).join('\n')

    await writeFile(this.systemdServicePath, serviceFile)
  }
}

import { execSync } from 'node:child_process'
import { userInfo } from 'node:os'
import { resolve } from 'node:path'
import process from 'node:process'

import { chmod, existsSync, outputFile, readFileSync, unlinkSync } from 'fs-extra'

import { BasePlatform } from '../base-platform'

export class FreeBSDInstaller extends BasePlatform {
  private get rcServiceName() {
    return this.hbService.serviceName.toLowerCase()
  }

  private get rcServicePath() {
    return resolve('/usr/local/etc/rc.d', this.rcServiceName)
  }

  /**
   * Installs the rc service
   */
  public async install() {
    this.checkForRoot()
    await this.checkUser()
    this.setupSudo()

    await this.hbService.portCheck()
    await this.hbService.storagePathCheck()
    await this.hbService.configCheck()

    try {
      await this.createRCService()
      await this.enableService()
      await this.start()
      await this.hbService.printPostInstallInstructions()
    } catch (e) {
      console.error(e.toString())
      this.hbService.logger('ERROR: Failed Operation', 'fail')
    }
  }

  /**
   * Removes the rc service
   */
  public async uninstall() {
    this.checkForRoot()
    await this.stop()

    // try and disable the service
    await this.disableService()

    try {
      if (existsSync(this.rcServicePath)) {
        this.hbService.logger(`Removed ${this.rcServiceName} Service`, 'succeed')
        unlinkSync(this.rcServicePath)
      } else {
        this.hbService.logger(`Could not find installed ${this.rcServiceName} Service.`, 'fail')
      }
    } catch (e) {
      console.error(e.toString())
      this.hbService.logger('ERROR: Failed Operation', 'fail')
    }
  }

  /**
   * Starts the rc service
   */
  public async start() {
    this.checkForRoot()
    try {
      this.hbService.logger(`Starting ${this.rcServiceName} Service...`)
      execSync(`service ${this.rcServiceName} start`, { stdio: 'inherit' })
      this.hbService.logger(`${this.rcServiceName} Started`, 'succeed')
    } catch (e) {
      this.hbService.logger(`Failed to start ${this.rcServiceName}`, 'fail')
    }
  }

  /**
   * Stops the rc service
   */
  public async stop() {
    this.checkForRoot()
    try {
      this.hbService.logger(`Stopping ${this.rcServiceName} Service...`)
      execSync(`service ${this.rcServiceName} stop`, { stdio: 'inherit' })
      this.hbService.logger(`${this.rcServiceName} Stopped`, 'succeed')
    } catch (e) {
      this.hbService.logger(`Failed to stop ${this.rcServiceName}`, 'fail')
    }
  }

  /**
   * Restarts the rc service
   */
  public async restart() {
    this.checkForRoot()
    try {
      this.hbService.logger(`Restarting ${this.rcServiceName} Service...`)
      execSync(`service ${this.rcServiceName} restart`, { stdio: 'inherit' })
      this.hbService.logger(`${this.rcServiceName} Restarted`, 'succeed')
    } catch (e) {
      this.hbService.logger(`Failed to restart ${this.rcServiceName}`, 'fail')
    }
  }

  /**
   * Rebuilds the Node.js modules for Homebridge UI
   */
  public async rebuild(all = false) {
    try {
      this.checkForRoot()
      const npmGlobalPath = execSync('/bin/echo -n "$(npm -g prefix)/lib/node_modules"', {
        env: Object.assign({
          npm_config_loglevel: 'silent',
          npm_update_notifier: 'false',
        }, process.env),
      }).toString('utf8')
      const targetNodeVersion = execSync('node -v').toString('utf8').trim()

      execSync('npm rebuild --unsafe-perm', {
        cwd: process.env.UIX_BASE_PATH,
        stdio: 'inherit',
      })

      if (all === true) {
        // rebuild all modules
        try {
          execSync('npm rebuild --unsafe-perm', {
            cwd: npmGlobalPath,
            stdio: 'inherit',
          })
        } catch (e) {
          this.hbService.logger('Could not rebuild all modules - check Homebridge logs.', 'warn')
        }
      }

      this.hbService.logger(`Rebuilt modules in ${process.env.UIX_BASE_PATH} for Node.js ${targetNodeVersion}.`, 'succeed')
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
      return execSync(`sockstat -P tcp -p ${port} -l -q 2> /dev/null | awk '{print $3}' | head -n 1`).toString('utf8').trim()
    } catch (e) {
      return null
    }
  }

  /**
   * Enables rc service for autostart
   */
  private async enableService() {
    try {
      execSync(`sysrc ${this.rcServiceName}_enable="YES" 2> /dev/null`)
    } catch (e) {
      this.hbService.logger(`WARNING: failed to run "sysrc ${this.rcServiceName}_enable=\"YES\"`, 'warn')
    }
  }

  /**
   * Disables rc service for autostart
   */
  private async disableService() {
    try {
      execSync(`sysrc ${this.rcServiceName}_enable="NO" 2> /dev/null`)
    } catch (e) {
      this.hbService.logger(`WARNING: failed to run "sysrc ${this.rcServiceName}_enable=\"NO\"`, 'warn')
    }
  }

  /**
   * Check the command is being run as root and we can detect the user
   */
  private checkForRoot() {
    if (process.getuid() !== 0) {
      this.hbService.logger('ERROR: This command must be executed using sudo on FreeBSD', 'fail')
      this.hbService.logger(`EXAMPLE: sudo hb-service ${this.hbService.action}`, 'fail')
      process.exit(1)
    }
    if (this.hbService.action === 'install' && !process.env.SUDO_USER && !this.hbService.asUser) {
      this.hbService.logger('ERROR: Could not detect user. Pass in the user you want to run Homebridge as using the --user flag eg.', 'fail')
      this.hbService.logger(`EXAMPLE: sudo hb-service ${this.hbService.action} --user your-user`, 'fail')
      process.exit(1)
    }
  }

  /**
   * Checks the user exists
   */
  private async checkUser() {
    try {
      // check if user exists
      execSync(`id ${this.hbService.asUser} 2> /dev/null`)
    } catch (e) {
      // if not create the user
      execSync(`pw useradd -q -n ${this.hbService.asUser} -s /usr/sbin/nologin 2> /dev/null`)
      this.hbService.logger(`Created service user: ${this.hbService.asUser}`, 'info')
    }
  }

  /**
   * Allows the homebridge user to shut down and restart the server from the UI
   * There is no need for full sudo access when running using hb-service
   */
  private setupSudo() {
    try {
      const npmPath = execSync('which npm').toString('utf8').trim()
      const sudoersEntry = `${this.hbService.asUser}    ALL=(ALL) NOPASSWD:SETENV: ${npmPath}, /usr/local/bin/npm`

      // check if the sudoers file already contains the entry
      const sudoers = readFileSync('/usr/local/etc/sudoers', 'utf-8')
      if (sudoers.includes(sudoersEntry)) {
        return
      }

      // grant the user restricted sudo privileges to /sbin/shutdown
      execSync(`echo '${sudoersEntry}' | sudo EDITOR='tee -a' visudo`)
    } catch (e) {
      this.hbService.logger('WARNING: Failed to setup /etc/sudoers, you may not be able to shutdown/restart your server from the Homebridge UI.', 'warn')
    }
  }

  /**
   * Update Node.js
   */
  public async updateNodejs(job: { target: string, rebuild: boolean }) { // eslint-disable-line unused-imports/no-unused-vars
    this.hbService.logger('Update Node.js using pkg manually.', 'fail')
    process.exit(1)
  }

  /**
   * Create the rc service script
   */
  private async createRCService() {
    const rcFileContents = [
      '#!/bin/sh',
      '#',
      `# PROVIDE: ${this.rcServiceName}`,
      '# REQUIRE: NETWORKING SYSLOG',
      '# KEYWORD: shutdown',
      '#',
      `# Add the following lines to /etc/rc.conf to enable ${this.rcServiceName}:`,
      '#',
      `#${this.rcServiceName}_enable="YES"`,
      '',
      '. /etc/rc.subr',
      '',
      `name="${this.rcServiceName}"`,
      `rcvar="${this.rcServiceName}_enable"`,
      '',
      'load_rc_config $name',
      '',
      `: \${${this.rcServiceName}_user:="${this.hbService.asUser}"}`,
      `: \${${this.rcServiceName}_enable:="NO"}`,
      `: \${${this.rcServiceName}_facility:="daemon"}`,
      `: \${${this.rcServiceName}_priority:="debug"}`,
      `: \${${this.rcServiceName}_storage_path:="${this.hbService.storagePath}"}`,
      '',
      'export HOME="$(eval echo ~${homebridge_user})"', // eslint-disable-line no-template-curly-in-string
      'export PATH=/usr/local/bin:${PATH}', // eslint-disable-line no-template-curly-in-string
      'export HOMEBRIDGE_CONFIG_UI_TERMINAL=1',
      'export UIX_STORAGE_PATH="${homebridge_storage_path}"', // eslint-disable-line no-template-curly-in-string
      '',
      'pidfile="/var/run/${name}.pid"', // eslint-disable-line no-template-curly-in-string
      'command="/usr/sbin/daemon"',
      'procname="daemon"',
      `command_args=" -c -f -R 3 -P \${pidfile} ${this.hbService.selfPath} run -U \${homebridge_storage_path}"`,
      'start_precmd="homebridge_precmd"',
      '',
      'homebridge_precmd()',
      '{',
      '   sleep 10',
      '   chown -R ${homebridge_user}: ${homebridge_storage_path}', // eslint-disable-line no-template-curly-in-string
      '   install -o ${homebridge_user} /dev/null ${pidfile}', // eslint-disable-line no-template-curly-in-string
      '}',
      '',
      'run_rc_command "$1"',
    ].filter(x => x).join('\n')

    await outputFile(this.rcServicePath, rcFileContents)
    await chmod(this.rcServicePath, '755')
  }
}

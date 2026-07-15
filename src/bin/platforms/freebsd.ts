import { execSync } from 'node:child_process'
import { existsSync, readFileSync, unlinkSync } from 'node:fs'
import { chmod } from 'node:fs/promises'
import { userInfo } from 'node:os'
import { resolve } from 'node:path'
import process from 'node:process'

import { outputFile } from 'fs-extra/esm'

import { RE_OS_USERNAME } from '../../core/regex.constants.js'
import { BasePlatform } from '../base-platform.js'

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
      this.hbService.logger.error('ERROR: Failed Operation')
    }
  }

  /**
   * Removes the rc service
   */
  public async uninstall() {
    this.checkForRoot()
    await this.stop()

    // Try and disable the service
    await this.disableService()

    try {
      if (existsSync(this.rcServicePath)) {
        this.hbService.logger.success(`Removed ${this.rcServiceName} Service`)
        unlinkSync(this.rcServicePath)
      } else {
        this.hbService.logger.error(`Could not find installed ${this.rcServiceName} Service.`)
      }
    } catch (e) {
      console.error(e.toString())
      this.hbService.logger.error('ERROR: Failed Operation')
    }
  }

  /**
   * Starts the rc service
   */
  public async start() {
    this.checkForRoot()
    try {
      this.hbService.logger.log(`Starting ${this.rcServiceName} Service...`)
      execSync(`service ${this.rcServiceName} start`, { stdio: 'inherit' })
      this.hbService.logger.success(`${this.rcServiceName} Started`)
    } catch (e) {
      this.hbService.logger.error(`Failed to start ${this.rcServiceName}`)
    }
  }

  /**
   * Stops the rc service
   */
  public async stop() {
    this.checkForRoot()
    try {
      this.hbService.logger.log(`Stopping ${this.rcServiceName} Service...`)
      execSync(`service ${this.rcServiceName} stop`, { stdio: 'inherit' })
      this.hbService.logger.success(`${this.rcServiceName} Stopped`)
    } catch (e) {
      this.hbService.logger.error(`Failed to stop ${this.rcServiceName}`)
    }
  }

  /**
   * Restarts the rc service
   */
  public async restart() {
    this.checkForRoot()
    try {
      this.hbService.logger.log(`Restarting ${this.rcServiceName} Service...`)
      execSync(`service ${this.rcServiceName} restart`, { stdio: 'inherit' })
      this.hbService.logger.success(`${this.rcServiceName} Restarted`)
    } catch (e) {
      this.hbService.logger.error(`Failed to restart ${this.rcServiceName}`)
    }
  }

  /**
   * Rebuilds the Node.js modules for Homebridge UI
   */
  public async rebuild(all = false) {
    try {
      this.checkForRoot()
      const npmGlobalPath = execSync('/bin/echo -n "$(npm -g prefix)/lib/node_modules"', {
        env: {
          npm_config_loglevel: 'silent',
          npm_update_notifier: 'false',
          ...process.env,
        },
      }).toString('utf8')
      const targetNodeVersion = execSync('node -v').toString('utf8').trim()

      execSync('npm rebuild', {
        cwd: process.env.UIX_BASE_PATH,
        stdio: 'inherit',
      })

      if (all === true) {
        // Rebuild all modules
        try {
          execSync('npm rebuild', {
            cwd: npmGlobalPath,
            stdio: 'inherit',
          })
        } catch (e) {
          this.hbService.logger.warn('Could not rebuild all modules - check Homebridge logs.')
        }
      }

      this.hbService.logger.success(`Rebuilt modules in ${process.env.UIX_BASE_PATH} for Node.js ${targetNodeVersion}.`)
    } catch (e) {
      console.error(e.toString())
      this.hbService.logger.error('ERROR: Failed Operation')
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
      this.hbService.logger.warn(`WARNING: failed to run "sysrc ${this.rcServiceName}_enable=\"YES\"`)
    }
  }

  /**
   * Disables rc service for autostart
   */
  private async disableService() {
    try {
      execSync(`sysrc ${this.rcServiceName}_enable="NO" 2> /dev/null`)
    } catch (e) {
      this.hbService.logger.warn(`WARNING: failed to run "sysrc ${this.rcServiceName}_enable=\"NO\"`)
    }
  }

  /**
   * Check the command is being run as root and we can detect the user
   */
  private checkForRoot() {
    if (process.getuid() !== 0) {
      this.hbService.logger.error('ERROR: This command must be executed using sudo on FreeBSD')
      this.hbService.logger.error(`EXAMPLE: sudo hb-service ${this.hbService.action}`)
      process.exit(1)
    }
    if (this.hbService.action === 'install' && !process.env.SUDO_USER && !this.hbService.asUser) {
      this.hbService.logger.error('ERROR: Could not detect user. Pass in the user you want to run Homebridge as using the --user flag eg.')
      this.hbService.logger.error(`EXAMPLE: sudo hb-service ${this.hbService.action} --user your-user`)
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
      execSync(`pw useradd -q -n ${this.hbService.asUser} -s /usr/sbin/nologin 2> /dev/null`)
      this.hbService.logger.log(`Created service user: ${this.hbService.asUser}`)
    }
  }

  /**
   * Allows the homebridge user to shut down and restart the server from the UI
   * There is no need for full sudo access when running using hb-service
   */
  private setupSudo() {
    try {
      // Refuse to interpolate an unvalidated username into the sudoers line —
      // a crafted `--user` could otherwise inject `, /bin/sh` and grant NOPASSWD.
      if (!RE_OS_USERNAME.test(this.hbService.asUser)) {
        this.hbService.logger.warn(
          `WARNING: Refusing to write /usr/local/etc/sudoers entry — invalid username "${this.hbService.asUser}".`,
        )
        return
      }

      const npmPath = execSync('which npm').toString('utf8').trim()
      const sudoersEntry = `${this.hbService.asUser}    ALL=(ALL) NOPASSWD:SETENV: ${npmPath}, /usr/local/bin/npm`

      // Check if the sudoers file already contains the entry
      const sudoers = readFileSync('/usr/local/etc/sudoers', 'utf-8')
      if (sudoers.includes(sudoersEntry)) {
        return
      }

      // Grant the user restricted sudo privileges to /sbin/shutdown
      execSync(`echo '${sudoersEntry}' | sudo EDITOR='tee -a' visudo`)
    } catch (e) {
      this.hbService.logger.warn('WARNING: Failed to setup /etc/sudoers, you may not be able to shutdown/restart your server from the Homebridge UI.')
    }
  }

  /**
   * Update Node.js
   */
  public async updateNodejs(job: { target: string, rebuild: boolean }) {
    this.hbService.logger.error('Update Node.js using pkg manually.')
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
      // Body must reference ${<rcServiceName>_user} and
      // ${<rcServiceName>_storage_path}, not the literal "homebridge_"
      // prefix. Under a custom service name the vars are defined as
      // e.g. homebridge2_user, so a hard-coded ${homebridge_user} would
      // read empty — chown -R would then run without a user and
      // command_args would run with -U "".
      `export HOME="$(eval echo ~\${${this.rcServiceName}_user})"`,
      'export PATH=/usr/local/bin:${PATH}', // eslint-disable-line no-template-curly-in-string
      'export HOMEBRIDGE_CONFIG_UI_TERMINAL=1',
      `export UIX_STORAGE_PATH="\${${this.rcServiceName}_storage_path}"`,
      '',
      'pidfile="/var/run/${name}.pid"', // eslint-disable-line no-template-curly-in-string
      'command="/usr/sbin/daemon"',
      'procname="daemon"',
      `command_args=" -c -f -R 3 -P \${pidfile} ${this.hbService.selfPath} run -U \${${this.rcServiceName}_storage_path}"`,
      'start_precmd="homebridge_precmd"',
      '',
      'homebridge_precmd()',
      '{',
      '   sleep 10',
      `   chown -R \${${this.rcServiceName}_user}: \${${this.rcServiceName}_storage_path}`,
      `   install -o \${${this.rcServiceName}_user} /dev/null \${pidfile}`,
      '}',
      '',
      'run_rc_command "$1"',
    ].filter(x => x).join('\n')

    await outputFile(this.rcServicePath, rcFileContents)
    await chmod(this.rcServicePath, '755')
  }
}

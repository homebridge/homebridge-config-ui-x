import * as os from 'os';
import * as path from 'path';
import * as child_process from 'child_process';
import * as fs from 'fs-extra';
import * as si from 'systeminformation';

import { HomebridgeServiceHelper } from '../hb-service';

export class LinuxInstaller {
  private hbService: HomebridgeServiceHelper;

  constructor(hbService: HomebridgeServiceHelper) {
    this.hbService = hbService;
  }

  private get systemdServiceName() {
    return this.hbService.serviceName.toLowerCase();
  }

  private get systemdServicePath() {
    return path.resolve('/etc/systemd/system', this.systemdServiceName + '.service');
  }

  private get systemdEnvPath() {
    return path.resolve('/etc/default', this.systemdServiceName);
  }

  private get runPartsPath() {
    return path.resolve('/etc/hb-service', this.hbService.serviceName.toLowerCase(), 'prestart.d');
  }

  /**
   * Installs the systemd service
   */
  public async install() {
    this.checkForRoot();
    await this.checkUser();
    this.setupSudo();

    await this.hbService.portCheck();
    await this.hbService.storagePathCheck();
    await this.hbService.configCheck();

    try {
      await this.createSystemdEnvFile();
      await this.createSystemdService();
      await this.createRunPartsPath();
      await this.reloadSystemd();
      await this.enableService();
      await this.start();
      await this.hbService.printPostInstallInstructions();
    } catch (e) {
      console.error(e.toString());
      this.hbService.logger(`ERROR: Failed Operation`);
    }
  }

  public async uninstall() {
    this.checkForRoot();
    await this.stop();

    // try and disable the service
    await this.disableService();

    try {
      if (fs.existsSync(this.systemdServicePath)) {
        fs.unlinkSync(this.systemdServicePath);
      }
      if (fs.existsSync(this.systemdEnvPath)) {
        fs.unlinkSync(this.systemdEnvPath);
      }
      this.hbService.logger(`Removed ${this.hbService.serviceName} Service.`);
    } catch (e) {
      console.error(e.toString());
      this.hbService.logger(`ERROR: Failed Operation`);
    }
  }

  /**
   * Starts the systemd service
   */
  public async start() {
    this.checkForRoot();
    this.fixPermissions();
    try {
      this.hbService.logger(`Starting ${this.hbService.serviceName} Service...`);
      child_process.execSync(`systemctl start ${this.systemdServiceName}`);
      this.hbService.logger(`${this.hbService.serviceName} Started`);
    } catch (e) {
      this.hbService.logger(`Failed to start ${this.hbService.serviceName}`);
    }
  }

  /**
   * Stops the systemd service
   */
  public async stop() {
    this.checkForRoot();
    try {
      this.hbService.logger(`Stopping ${this.hbService.serviceName} Service...`);
      child_process.execSync(`systemctl stop ${this.systemdServiceName}`);
      this.hbService.logger(`${this.hbService.serviceName} Stopped`);
    } catch (e) {
      this.hbService.logger(`Failed to stop ${this.systemdServiceName}`);
    }
  }

  /**
   * Restarts the systemd service
   */
  public async restart() {
    this.checkForRoot();
    this.fixPermissions();
    try {
      this.hbService.logger(`Restarting ${this.hbService.serviceName} Service...`);
      child_process.execSync(`systemctl restart ${this.systemdServiceName}`);
      this.hbService.logger(`${this.hbService.serviceName} Restarted`);
    } catch (e) {
      this.hbService.logger(`Failed to restart ${this.hbService.serviceName}`);
    }
  }

  /**
   * Rebuilds the Node.js modules for Homebridge Config UI X
   */
  public async rebuild() {
    try {
      this.checkForRoot();

      child_process.execSync('npm rebuild --unsafe-perm node-pty-prebuilt-multiarch', {
        cwd: process.env.UIX_BASE_PATH,
        stdio: 'inherit',
      });

      this.hbService.logger(`Rebuilt modules in ${process.env.UIX_BASE_PATH} for Node.js ${process.version}.`);
    } catch (e) {
      console.error(e.toString());
      this.hbService.logger(`ERROR: Failed Operation`);
    }
  }

  /**
   * Returns the users uid and gid.
   */
  public async getId(): Promise<{ uid: number, gid: number }> {
    if (process.getuid() === 0 && this.hbService.asUser) {
      const uid = child_process.execSync(`id -u ${this.hbService.asUser}`).toString('utf8');
      const gid = child_process.execSync(`id -g ${this.hbService.asUser}`).toString('utf8');
      return {
        uid: parseInt(uid, 10),
        gid: parseInt(gid, 10),
      };
    } else {
      return {
        uid: os.userInfo().uid,
        gid: os.userInfo().gid,
      };
    }
  }

  /**
   * Returns the pid of the process running on the defined port
   */
  public getPidOfPort(port: number) {
    try {
      return child_process.execSync(`fuser ${port}/tcp 2>/dev/null`).toString('utf8').trim();
    } catch (e) {
      return null;
    }
  }

  /**
   * Reloads systemd
   */
  private async reloadSystemd() {
    try {
      child_process.execSync('systemctl daemon-reload');
    } catch (e) {
      this.hbService.logger('WARNING: failed to run "systemctl daemon-reload"');
    }
  }

  /**
   * Enables systemd service for autostart
   */
  private async enableService() {
    try {
      child_process.execSync(`systemctl enable ${this.systemdServiceName} 2> /dev/null`);
    } catch (e) {
      this.hbService.logger('WARNING: failed to run "systemctl enable ..."');
    }
  }

  /**
   * Enables systemd service for autostart
   */
  private async disableService() {
    try {
      child_process.execSync(`systemctl disable ${this.systemdServiceName} 2> /dev/null`);
    } catch (e) {
      this.hbService.logger('WARNING: failed to run "systemctl disable ..."');
    }
  }

  /**
   * Check the command is being run as root and we can detect the user
   */
  private checkForRoot() {
    if (process.getuid() !== 0) {
      this.hbService.logger('ERROR: This command must be executed using sudo on Linux');
      this.hbService.logger(`sudo hb-service ${this.hbService.action} --user ${this.hbService.asUser || 'your-user'}`);
      process.exit(1);
    }
    if (this.hbService.action === 'install' && !this.hbService.asUser) {
      this.hbService.logger('ERROR: User parameter missing. Pass in the user you want to run Homebridge as using the --user flag eg.');
      this.hbService.logger(`sudo hb-service ${this.hbService.action} --user your-user`);
      process.exit(1);
    }
  }

  /**
   * Checks the user exists
   */
  private async checkUser() {
    try {
      // check if user exists
      child_process.execSync(`id ${this.hbService.asUser} 2> /dev/null`);
    } catch (e) {
      // if not create the user
      child_process.execSync(`useradd -m --system ${this.hbService.asUser}`);
    }

    try {
      // try and add the user to commonly required groups if on Raspbian
      const osInfo = await si.osInfo();
      if (osInfo.distro === 'Raspbian GNU/Linux') {
        child_process.execSync(`usermod -a -G audio,bluetooth,dialout,gpio,video ${this.hbService.asUser} 2> /dev/null`);
      }
    } catch (e) {
      // do nothing
    }
  }

  /**
   * Allows the homebridge user to shutdown and restart the server from the UI
   * There is no need for full sudo access when running using hb-service
   */
  private setupSudo() {
    try {
      const npmPath = child_process.execSync('which npm').toString('utf8').trim();
      const shutdownPath = child_process.execSync('which shutdown').toString('utf8').trim();
      const sudoersEntry = `${this.hbService.asUser}    ALL=(ALL) NOPASSWD:SETENV: ${shutdownPath}, ${npmPath}`;

      // check if the sudoers file already contains the entry
      const sudoers = fs.readFileSync('/etc/sudoers', 'utf-8');
      if (sudoers.includes(sudoersEntry)) {
        return;
      }

      // grant the user restricted sudo privileges to /sbin/shutdown
      child_process.execSync(`echo '${sudoersEntry}' | sudo EDITOR='tee -a' visudo`);
    } catch (e) {
      this.hbService.logger('WARNING: Failed to setup /etc/sudoers, you may not be able to shutdown/restart your server from the Homebridge UI.');
    }
  }

  /**
   * Fixes the permission on the storage path
   */
  private fixPermissions() {
    if (fs.existsSync(this.systemdServicePath) && fs.existsSync(this.systemdEnvPath)) {
      try {
        // extract the user this process is running as
        const serviceUser = child_process.execSync(`cat "${this.systemdServicePath}" | grep "User=" | awk -F'=' '{print $2}'`)
          .toString('utf8').trim();

        // get the storage path (we may not know it when running the start command)
        const storagePath = child_process.execSync(`cat "${this.systemdEnvPath}" | grep "UIX_STORAGE_PATH" | awk -F'=' '{print $2}' | sed -e 's/^"//' -e 's/"$//'`)
          .toString('utf8').trim();

        if (storagePath.length > 5 && fs.existsSync(storagePath)) {
          // chown the storage directory to the service user
          child_process.execSync(`chown -R ${serviceUser}: "${storagePath}"`);
        }
      } catch (e) {
        this.hbService.logger(`WARNING: Failed to set permissions`);
      }
    }
  }

  /**
   * Setup the run-parts path and scripts
   * This allows users to define their own scripts to run before Homebridge starts/restarts
   * The default script will ensure the homebridge storage path has the correct permissions each time Homebridge starts
   */
  private async createRunPartsPath() {
    await fs.mkdirp(this.runPartsPath);

    const permissionScriptPath = path.resolve(this.runPartsPath, '10-fix-permissions');
    const permissionScript = [
      `#!/bin/sh`,
      ``,
      `# Ensure the storage path permissions are correct`,
      `if [ -n "$UIX_STORAGE_PATH" ] && [ -n "$USER" ]; then`,
      `  echo "Ensuring $UIX_STORAGE_PATH is owned by $USER"`,
      `  [ -d $UIX_STORAGE_PATH ] || mkdir -p $UIX_STORAGE_PATH`,
      `  chown -R $USER: $UIX_STORAGE_PATH`,
      `fi`,
    ].filter(x => x !== null).join('\n');

    await fs.writeFile(permissionScriptPath, permissionScript);
    await fs.chmod(permissionScriptPath, '755');
  }

  /**
   * Create the systemd environment file
   */
  private async createSystemdEnvFile() {
    const envFile = [
      `HOMEBRIDGE_OPTS=-I -U "${this.hbService.storagePath}"`,
      `UIX_STORAGE_PATH="${this.hbService.storagePath}"`,
      '',
      `# To enable web terminals via homebridge-config-ui-x uncomment the following line`,
      `HOMEBRIDGE_CONFIG_UI_TERMINAL=1`,
      '',
      `DISABLE_OPENCOLLECTIVE=true`,
    ].filter(x => x !== null).join('\n');

    await fs.writeFile(this.systemdEnvPath, envFile);
  }

  /**
   * Create the systemd service file
   */
  private async createSystemdService() {
    const serviceFile = [
      `[Unit]`,
      `Description=${this.hbService.serviceName}`,
      `After=syslog.target network-online.target`,
      '',
      `[Service]`,
      `Type=simple`,
      `User=${this.hbService.asUser}`,
      `PermissionsStartOnly=true`,
      `EnvironmentFile=/etc/default/${this.systemdServiceName}`,
      `ExecStartPre=-run-parts ${this.runPartsPath}`,
      `ExecStartPre=-${this.hbService.selfPath} before-start $HOMEBRIDGE_OPTS`,
      `ExecStart=${this.hbService.selfPath} run $HOMEBRIDGE_OPTS`,
      `Restart=always`,
      `RestartSec=3`,
      `KillMode=process`,
      `CapabilityBoundingSet=CAP_IPC_LOCK CAP_NET_ADMIN CAP_NET_BIND_SERVICE CAP_NET_RAW CAP_SETGID CAP_SETUID CAP_SYS_CHROOT CAP_CHOWN CAP_FOWNER CAP_DAC_OVERRIDE CAP_AUDIT_WRITE CAP_SYS_ADMIN`,
      `AmbientCapabilities=CAP_NET_RAW`,
      '',
      `[Install]`,
      `WantedBy=multi-user.target`,
    ].filter(x => x !== null).join('\n');

    await fs.writeFile(this.systemdServicePath, serviceFile);
  }
}
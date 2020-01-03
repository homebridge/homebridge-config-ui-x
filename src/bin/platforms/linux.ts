import * as os from 'os';
import * as path from 'path';
import * as child_process from 'child_process';
import * as fs from 'fs-extra';

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

  public async install() {
    this.checkForRoot();
    this.checkUser();
    this.setupAcl();

    await this.hbService.portCheck();
    await this.hbService.storagePathCheck();
    await this.hbService.configCheck();

    try {
      await this.createSystemdEnvFile();
      await this.createSystemdService();
      await this.reloadSystemd();
      await this.enableService();
      await this.start();
      this.hbService.printPostInstallInstructions();
    } catch (e) {
      console.error(e.toString());
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

  public async start() {
    this.checkForRoot();
    this.fixPermissions();
    try {
      this.hbService.logger(`Starting ${this.hbService.serviceName} Service...`);
      child_process.execSync(`systemctl start ${this.systemdServiceName}`);
      this.hbService.logger(`${this.hbService.serviceName} Started`);
    } catch (e) {
      this.hbService.logger(`Failed to start ${this.hbService.serviceName}`);
      this.hbService.logger(`Check the logs for more information`);
    }
  }

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
      child_process.execSync(`systemctl enable ${this.systemdServiceName}`);
    } catch (e) {
      this.hbService.logger('WARNING: failed to run "systemctl enable ..."');
    }
  }

  /**
   * Enables systemd service for autostart
   */
  private async disableService() {
    try {
      child_process.execSync(`systemctl disable ${this.systemdServiceName}`);
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
  private checkUser() {
    try {
      // check if user exists
      child_process.execSync(`id ${this.hbService.asUser}`);
    } catch (e) {
      // if not create the user
      child_process.execSync(`useradd -m --system ${this.hbService.asUser}`);
    }
  }

  /**
   * Sets an ACL on the global node modules folder to allow the user to install plugins without needing sudo
   */
  private setupAcl() {
    try {
      // check setfacl is installed
      child_process.execSync('command -v setfacl');
    } catch (e) {
      // need to install setfacl
      this.installAcl();
    }

    try {
      const groupName = child_process.execSync(`id -gn ${this.hbService.asUser}`).toString('utf8').trim();
      // allow access to the global npm modules folder without needing root
      child_process.execSync(`setfacl -Rm d:g:${groupName}:rwx,g:${groupName}:rwx $(npm -g prefix)/lib/node_modules`);
      // allow access to the default npm bin location without needing root
      child_process.execSync(`setfacl -m g:${groupName}:rwx $(dirname $(which npm))`);
    } catch (e) {
      this.hbService.logger('WARNING: Failed to set ACL. You may not be able to install plugins using the UI.');
    }

  }

  /**
   * Installs the ACL package
   */
  private installAcl() {
    try {
      this.hbService.logger('The "acl" package is missing, installing now using apt-get...');
      this.hbService.logger('Running apt-get update...');
      child_process.execSync('apt-get update', { stdio: 'inherit' });
      this.hbService.logger('Running apt-get install -y acl...');
      child_process.execSync('apt-get install -y acl', { stdio: 'inherit' });
    } catch (e) {
      this.hbService.logger('WARNING: Failed to install the "acl" package.');
    }
  }

  /**
   * Fixes the permission on the storage path
   */
  private fixPermissions() {
    if (fs.existsSync(this.systemdServicePath) && fs.existsSync(this.systemdEnvPath)) {
      try {
        // extract the user this process is running as
        const serviceUser = child_process.execSync(`cat "${this.systemdServicePath}" | grep "User=" | awk -F'=' '{print $2}'`).toString('utf8').trim();

        // get the storage path (we may not know it when running the start command)
        const storagePath = child_process.execSync(`cat ${this.systemdEnvPath} | grep "UIX_STORAGE_PATH" | awk -F'=' '{print $2}' | sed -e 's/^"//' -e 's/"$//'`).toString('utf8').trim();

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
      `EnvironmentFile=/etc/default/${this.systemdServiceName}`,
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
import * as os from 'os';
import * as path from 'path';
import * as child_process from 'child_process';
import * as fs from 'fs-extra';
import * as si from 'systeminformation';
import * as semver from 'semver';

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
      await this.createFirewallRules();
      await this.start();
      await this.hbService.printPostInstallInstructions();
    } catch (e) {
      console.error(e.toString());
      this.hbService.logger('ERROR: Failed Operation', 'fail');
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

      // reload services
      await this.reloadSystemd();

      this.hbService.logger(`Removed ${this.hbService.serviceName} Service`, 'succeed');
    } catch (e) {
      console.error(e.toString());
      this.hbService.logger('ERROR: Failed Operation', 'fail');
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
      this.hbService.logger(`${this.hbService.serviceName} Started`, 'succeed');
    } catch (e) {
      this.hbService.logger(`Failed to start ${this.hbService.serviceName}`, 'fail');
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
      this.hbService.logger(`${this.hbService.serviceName} Stopped`, 'succeed');
    } catch (e) {
      this.hbService.logger(`Failed to stop ${this.systemdServiceName}`, 'fail');
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
      this.hbService.logger(`${this.hbService.serviceName} Restarted`, 'succeed');
    } catch (e) {
      this.hbService.logger(`Failed to restart ${this.hbService.serviceName}`, 'fail');
    }
  }

  /**
   * Rebuilds the Node.js modules for Homebridge Config UI X
   */
  public async rebuild(all = false) {
    try {
      this.checkForRoot();
      const npmGlobalPath = child_process.execSync('/bin/echo -n "$(npm --no-update-notifier -g prefix)/lib/node_modules"').toString('utf8');
      const targetNodeVersion = child_process.execSync('node -v').toString('utf8').trim();

      child_process.execSync('npm rebuild --unsafe-perm node-pty-prebuilt-multiarch', {
        cwd: process.env.UIX_BASE_PATH,
        stdio: 'inherit',
      });

      if (all === true) {
        // rebuild all modules
        try {
          child_process.execSync('npm rebuild --unsafe-perm', {
            cwd: npmGlobalPath,
            stdio: 'inherit',
          });
        } catch (e) {
          this.hbService.logger('Could not rebuild all modules - check Homebridge logs.', 'warn');
        }
      }

      this.hbService.logger(`Rebuilt modules in ${process.env.UIX_BASE_PATH} for Node.js ${targetNodeVersion}.`, 'succeed');
    } catch (e) {
      console.error(e.toString());
      this.hbService.logger('ERROR: Failed Operation', 'fail');
    }
  }

  /**
   * Returns the users uid and gid.
   */
  public async getId(): Promise<{ uid: number; gid: number }> {
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
      if (this.hbService.docker) {
        return child_process.execSync('pidof homebridge').toString('utf8').trim();
      } else {
        return child_process.execSync(`fuser ${port}/tcp 2>/dev/null`).toString('utf8').trim();
      }
    } catch (e) {
      return null;
    }
  }

  /**
   * Update Node.js
   */
  public async updateNodejs(job: { target: string; rebuild: boolean }) {
    this.checkForRoot();

    // check target path
    const targetPath = path.dirname(path.dirname(process.execPath));

    if (targetPath !== '/usr' && targetPath !== '/usr/local') {
      this.hbService.logger(`Cannot update Node.js on your system. Non-standard installation path detected: ${targetPath}`, 'fail');
      process.exit(1);
    }

    if (targetPath === '/usr' && await fs.pathExists('/etc/apt/sources.list.d/nodesource.list')) {
      // update from nodesource
      await this.updateNodeFromNodesource(job);
    } else {
      // update from tarball
      await this.updateNodeFromTarball(job, targetPath);
    }

    // rebuild node modules if required
    if (job.rebuild) {
      this.hbService.logger(`Rebuilding for Node.js ${job.target}...`);
      await this.rebuild(true);
    }

    // restart
    if (await fs.pathExists(this.systemdServicePath)) {
      await this.restart();
    } else {
      this.hbService.logger('Please restart Homebridge for the changes to take effect.', 'warn');
    }
  }

  /**
   * Update Node.js from the tarball archives
   */
  private async updateNodeFromTarball(job: { target: string; rebuild: boolean }, targetPath: string) {
    // only glibc linux >=2.24 is supported
    try {
      const glibcVersion = parseFloat(child_process.execSync('getconf GNU_LIBC_VERSION 2>/dev/null').toString().split('glibc')[1].trim());
      if (glibcVersion < 2.24) {
        this.hbService.logger('Your version of Linux does not meet the GLIBC version requirements to use this tool to upgrade Node.js. ' +
          `Wanted: >=2.24. Installed: ${glibcVersion}`, 'fail');
        process.exit(1);
      }
    } catch (e) {
      const osInfo = await si.osInfo();
      if (osInfo.distro === 'Alpine Linux') {
        this.hbService.logger('Updating Node.js on Alpine Linux / Docker is not supported by this command.', 'fail');
        this.hbService.logger('To update Node.js you should pull down the latest version of the oznu/homebridge Docker image.', 'fail');
      } else {
        this.hbService.logger('Updating Node.js using this tool is not supported on your version of Linux.');
      }
      process.exit(1);
    }

    const uname = child_process.execSync('uname -m').toString().trim();

    let downloadUrl;
    switch (uname) {
      case 'x86_64':
        downloadUrl = `https://nodejs.org/dist/${job.target}/node-${job.target}-linux-x64.tar.gz`;
        break;
      case 'aarch64':
        downloadUrl = `https://nodejs.org/dist/${job.target}/node-${job.target}-linux-arm64.tar.gz`;
        break;
      case 'armv7l':
        downloadUrl = `https://nodejs.org/dist/${job.target}/node-${job.target}-linux-armv7l.tar.gz`;
        break;
      case 'armv6l':
        downloadUrl = `https://unofficial-builds.nodejs.org/download/release/${job.target}/node-${job.target}-linux-armv6l.tar.gz`;
        break;
      default:
        this.hbService.logger(`Architecture not supported: ${process.arch}.`, 'fail');
        process.exit(1);
        break;
    }

    this.hbService.logger(`Target: ${targetPath}`);

    try {
      const archivePath = await this.hbService.downloadNodejs(downloadUrl);

      const extractConfig = {
        file: archivePath,
        cwd: targetPath,
        strip: 1,
        preserveOwner: false,
        unlink: true,
      };

      // extract
      await this.hbService.extractNodejs(job.target, extractConfig);

      // clean up
      await fs.remove(archivePath);
    } catch (e) {
      this.hbService.logger(`Failed to update Node.js: ${e.message}`, 'fail');
      process.exit(1);
    }
  }

  /**
   * Update the NodeSource repo and use it to update Node.js
   */
  private async updateNodeFromNodesource(job: { target: string; rebuild: boolean }) {
    this.hbService.logger('Updating from NodeSource...');

    try {
      const majorVersion = semver.parse(job.target).major;
      // update repo
      child_process.execSync(`curl -sL https://deb.nodesource.com/setup_${majorVersion}.x | bash -`, {
        stdio: 'inherit',
      });

      // remove current node.js if downgrading
      if (majorVersion < semver.parse(process.version).major) {
        child_process.execSync('apt-get remove -y nodejs', {
          stdio: 'inherit',
        });
      }

      // update node.js
      child_process.execSync('apt-get install -y nodejs', {
        stdio: 'inherit',
      });
    } catch (e) {
      this.hbService.logger(`Failed to update Node.js: ${e.message}`, 'fail');
      process.exit(1);
    }
  }

  /**
   * Reloads systemd
   */
  private async reloadSystemd() {
    try {
      child_process.execSync('systemctl daemon-reload');
    } catch (e) {
      this.hbService.logger('WARNING: failed to run "systemctl daemon-reload"', 'warn');
    }
  }

  /**
   * Enables systemd service for autostart
   */
  private async enableService() {
    try {
      child_process.execSync(`systemctl enable ${this.systemdServiceName} 2> /dev/null`);
    } catch (e) {
      this.hbService.logger(`WARNING: failed to run "systemctl enable ${this.systemdServiceName}"`, 'warn');
    }
  }

  /**
   * Enables systemd service for autostart
   */
  private async disableService() {
    try {
      child_process.execSync(`systemctl disable ${this.systemdServiceName} 2> /dev/null`);
    } catch (e) {
      this.hbService.logger(`WARNING: failed to run "systemctl disable ${this.systemdServiceName}"`, 'warn');
    }
  }

  /**
   * Check the command is being run as root and we can detect the user
   */
  private checkForRoot() {
    if (process.getuid() !== 0) {
      this.hbService.logger('ERROR: This command must be executed using sudo on Linux', 'fail');
      this.hbService.logger(`EXAMPLE: sudo hb-service ${this.hbService.action}`, 'fail');
      process.exit(1);
    }
    if (this.hbService.action === 'install' && !this.hbService.asUser) {
      this.hbService.logger('ERROR: User parameter missing. Pass in the user you want to run Homebridge as using the --user flag eg.', 'fail');
      this.hbService.logger(`EXAMPLE: sudo hb-service ${this.hbService.action} --user your-user`, 'fail');
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
      this.hbService.logger(`Created service user: ${this.hbService.asUser}`, 'info');
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
      const sudoersEntry = `${this.hbService.asUser}    ALL=(ALL) NOPASSWD:SETENV: ${shutdownPath}, ${npmPath}, /usr/bin/npm, /usr/local/bin/npm`;

      // check if the sudoers file already contains the entry
      const sudoers = fs.readFileSync('/etc/sudoers', 'utf-8');
      if (sudoers.includes(sudoersEntry)) {
        return;
      }

      // grant the user restricted sudo privileges to /sbin/shutdown
      child_process.execSync(`echo '${sudoersEntry}' | sudo EDITOR='tee -a' visudo`);
    } catch (e) {
      this.hbService.logger('WARNING: Failed to setup /etc/sudoers, you may not be able to shutdown/restart your server from the Homebridge UI.', 'warn');
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
        this.hbService.logger('WARNING: Failed to set permissions', 'warn');
      }
    }
  }

  /**
   * Opens the port in the firewall if required
   */
  private async createFirewallRules() {
    // check ufw is present on the system (debian based linux)
    if (await fs.pathExists('/usr/sbin/ufw')) {
      return await this.createUfwRules();
    }

    // check firewall-cmd is present on the system (enterprise linux)
    if (await fs.pathExists('/usr/bin/firewall-cmd')) {
      return await this.createFirewallCmdRules();
    }
  }

  /**
   * Use ufw to create firewall rules
   * ufw is used on ubuntu based systems
   */
  private async createUfwRules() {
    try {
      // check the firewall is active before doing anything
      const status = child_process.execSync('/bin/echo -n "$(ufw status)" 2> /dev/null').toString('utf8');
      if (!status.includes('Status: active')) {
        return;
      }

      // load the current config to get the Homebridge port
      const currentConfig = await fs.readJson(process.env.UIX_CONFIG_PATH);
      const bridgePort = currentConfig.bridge?.port;

      // add ui rule
      child_process.execSync(`ufw allow ${this.hbService.uiPort}/tcp 2> /dev/null`);
      this.hbService.logger(`Added firewall rule to allow inbound traffic on port ${this.hbService.uiPort}/tcp`, 'info');

      // add bridge rule
      if (bridgePort) {
        child_process.execSync(`ufw allow ${bridgePort}/tcp 2> /dev/null`);
        this.hbService.logger(`Added firewall rule to allow inbound traffic on port ${bridgePort}/tcp`, 'info');
      }
    } catch (e) {
      this.hbService.logger('WARNING: failed to allow ports through firewall.', 'warn');
    }
  }

  /**
   * User firewall-cmd to create firewall rules
   * firewall-cmd is used on enterprise / centos / fedora linux
   */
  private async createFirewallCmdRules() {
    try {
      // check the firewall is running before doing anything
      const status = child_process.execSync('/bin/echo -n "$(firewall-cmd --state)" 2> /dev/null').toString('utf8');
      if (status !== 'running') {
        return;
      }
      // load the current config to get the Homebridge port
      const currentConfig = await fs.readJson(process.env.UIX_CONFIG_PATH);
      const bridgePort = currentConfig.bridge?.port;

      // add ui rule
      child_process.execSync(`firewall-cmd --permanent --add-port=${this.hbService.uiPort}/tcp 2> /dev/null`);
      this.hbService.logger(`Added firewall rule to allow inbound traffic on port ${this.hbService.uiPort}/tcp`, 'info');

      // add bridge rule
      if (bridgePort) {
        child_process.execSync(`firewall-cmd --permanent --add-port=${bridgePort}/tcp 2> /dev/null`);
        this.hbService.logger(`Added firewall rule to allow inbound traffic on port ${bridgePort}/tcp`, 'info');
      }

      // reload the firewall
      child_process.execSync('firewall-cmd --reload 2> /dev/null');
      this.hbService.logger('Firewall reloaded', 'info');
    } catch (e) {
      this.hbService.logger('WARNING: failed to allow ports through firewall.', 'warn');
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
      '#!/bin/sh',
      '',
      '# Ensure the storage path permissions are correct',
      'if [ -n "$UIX_STORAGE_PATH" ] && [ -n "$USER" ]; then',
      '  echo "Ensuring $UIX_STORAGE_PATH is owned by $USER"',
      '  [ -d $UIX_STORAGE_PATH ] || mkdir -p $UIX_STORAGE_PATH',
      '  chown -R $USER: $UIX_STORAGE_PATH',
      'fi',
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
      '# To enable web terminals via homebridge-config-ui-x uncomment the following line',
      'HOMEBRIDGE_CONFIG_UI_TERMINAL=1',
      '',
      'DISABLE_OPENCOLLECTIVE=true',
    ].filter(x => x !== null).join('\n');

    await fs.writeFile(this.systemdEnvPath, envFile);
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
      `ExecStartPre=-run-parts ${this.runPartsPath}`,
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
    ].filter(x => x !== null).join('\n');

    await fs.writeFile(this.systemdServicePath, serviceFile);
  }
}

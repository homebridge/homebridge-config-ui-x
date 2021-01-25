import * as os from 'os';
import axios from 'axios';
import * as path from 'path';
import * as child_process from 'child_process';
import * as fs from 'fs-extra';

import { HomebridgeServiceHelper } from '../hb-service';

export class Win32Installer {
  private hbService: HomebridgeServiceHelper;

  constructor(hbService: HomebridgeServiceHelper) {
    this.hbService = hbService;
  }

  /**
   * Installs the Windows 10 Homebridge Service
   */
  public async install() {
    this.checkIsAdmin();
    await this.hbService.portCheck();
    await this.hbService.storagePathCheck();
    await this.hbService.configCheck();

    // download nssm.exe to help create the service
    const nssmPath: string = await this.downloadNssm();

    // commands to run
    const installCmd = `"${nssmPath}" install ${this.hbService.serviceName} ` +
      `"${process.execPath}" "\""${this.hbService.selfPath}"\"" run -I -U "\""${this.hbService.storagePath}"\""`;
    const setUserDirCmd = `"${nssmPath}" set ${this.hbService.serviceName} AppEnvironmentExtra ":UIX_STORAGE_PATH=${this.hbService.storagePath}"`;

    try {
      child_process.execSync(installCmd);
      child_process.execSync(setUserDirCmd);
      await this.configureFirewall();
      await this.start();
      await this.hbService.printPostInstallInstructions();
    } catch (e) {
      console.error(e.toString());
      this.hbService.logger('ERROR: Failed Operation', 'fail');
    }
  }

  /**
   * Removes the Windows 10 Homebridge Service
   */
  public async uninstall() {
    this.checkIsAdmin();

    // stop existing service
    await this.stop();

    try {
      child_process.execSync(`sc delete ${this.hbService.serviceName}`);
      this.hbService.logger(`Removed ${this.hbService.serviceName} Service`, 'succeed');
    } catch (e) {
      console.error(e.toString());
      this.hbService.logger('ERROR: Failed Operation', 'fail');
    }
  }

  /**
   * Starts the Windows 10 Homebridge Service
   */
  public async start() {
    this.checkIsAdmin();

    try {
      this.hbService.logger(`Starting ${this.hbService.serviceName} Service...`);
      child_process.execSync(`sc start ${this.hbService.serviceName}`);
      this.hbService.logger(`${this.hbService.serviceName} Started`, 'succeed');
    } catch (e) {
      this.hbService.logger(`Failed to start ${this.hbService.serviceName}`, 'fail');
    }
  }

  /**
   * Stops the Windows 10 Homebridge Service
   */
  public async stop() {
    this.checkIsAdmin();

    try {
      this.hbService.logger(`Stopping ${this.hbService.serviceName} Service...`);
      child_process.execSync(`sc stop ${this.hbService.serviceName}`);
      this.hbService.logger(`${this.hbService.serviceName} Stopped`, 'succeed');
    } catch (e) {
      this.hbService.logger(`Failed to stop ${this.hbService.serviceName}`, 'fail');
    }
  }

  /**
   * Restarts the Windows 10 Homebridge Service
   */
  public async restart() {
    this.checkIsAdmin();
    await this.stop();
    setTimeout(async () => {
      await this.start();
    }, 4000);
  }

  /**
   * Rebuilds the Node.js modules for Homebridge Config UI X
   */
  public async rebuild(all = false) {
    this.checkIsAdmin();

    try {
      child_process.execSync('npm rebuild --unsafe-perm node-pty-prebuilt-multiarch', {
        cwd: process.env.UIX_BASE_PATH,
        stdio: 'inherit',
      });

      this.hbService.logger(`Rebuilt modules in ${process.env.UIX_BASE_PATH} for Node.js ${process.version}.`, 'succeed');
    } catch (e) {
      console.error(e.toString());
      this.hbService.logger('ERROR: Failed Operation', 'fail');
    }
  }

  /**
   * Returns the users uid and gid. Not used on Windows
   */
  public async getId(): Promise<{ uid: number; gid: number }> {
    return {
      uid: 0,
      gid: 0,
    };
  }

  /**
   * Returns the pid of the process running on the defined port
   */
  public getPidOfPort(port: number) {
    return null;
  }

  /**
   * Update Node.js
   */
  public updateNodejs(job: { target: string; rebuild: boolean }) {
    this.hbService.logger('ERROR: This command is not supported on Windows.', 'fail');
    this.hbService.logger(`Please download Node.js v${job.target} from https://nodejs.org/en/download/ and install manually.`, 'fail');
  }

  /**
   * Checks if the current user is an admin
   */
  private checkIsAdmin() {
    try {
      child_process.execSync('fsutil dirty query %systemdrive% >nul');
    } catch (e) {
      this.hbService.logger('ERROR: This command must be run as an Administrator', 'fail');
      this.hbService.logger('Node.js command prompt shortcut -> Right Click -> Run as administrator', 'fail');
      process.exit(1);
    }
  }

  /**
   * Windows Only!
   * Downloads nssm - NSSM - the Non-Sucking Service Manager - https://nssm.cc/
   * This is used to create the Windows Services
   */
  private async downloadNssm(): Promise<string> {
    const downloadUrl = `https://github.com/oznu/nssm/releases/download/2.24-101-g897c7ad/nssm_${os.arch()}.exe`;
    const nssmPath = path.resolve(this.hbService.storagePath, 'nssm.exe');

    if (await fs.pathExists(nssmPath)) {
      return nssmPath;
    }

    const nssmFile = fs.createWriteStream(nssmPath);

    this.hbService.logger(`Downloading NSSM from ${downloadUrl}`);

    return new Promise((resolve, reject) => {
      axios({
        method: 'GET',
        url: downloadUrl,
        responseType: 'stream',
      }).then((response) => {
        response.data.pipe(nssmFile)
          .on('finish', () => {
            return resolve(nssmPath);
          })
          .on('error', (err) => {
            return reject(err);
          });
      }).catch(async (e) => {
        // cleanup
        nssmFile.close();
        await fs.remove(nssmPath);

        this.hbService.logger(`Failed to download nssm: ${e.message}`, 'fail');
        process.exit(0);
      });
    });
  }

  /**
   * Ensures the Node.js process is allowed to accept incoming connections
   */
  private async configureFirewall() {
    // firewall commands
    const cleanFirewallCmd = 'netsh advfirewall firewall Delete rule name="Homebridge"';
    const openFirewallCmd = `netsh advfirewall firewall add rule name="Homebridge" dir=in action=allow program="${process.execPath}"`;

    // try and remove any existing rules so there are not any duplicates
    try {
      child_process.execSync(cleanFirewallCmd);
    } catch (e) {
      // this is probably ok, the firewall rule may not exist to remove
    }

    // create a new firewall rule
    try {
      child_process.execSync(openFirewallCmd);
    } catch (e) {
      this.hbService.logger('Failed to configure firewall rule for Homebridge.', 'warn');
      this.hbService.logger(e);
    }
  }

}

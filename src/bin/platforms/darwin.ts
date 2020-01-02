import * as os from 'os';
import * as path from 'path';
import * as child_process from 'child_process';
import * as fs from 'fs-extra';

import { HomebridgeServiceHelper } from '../hb-service';

export class DarwinInstaller {
  private hbService: HomebridgeServiceHelper;
  private user: string;
  private plistName: string;
  private plistPath: string;

  constructor(hbService: HomebridgeServiceHelper) {
    this.hbService = hbService;
    this.plistName = `com.${this.hbService.serviceName.toLowerCase()}.server`;
    this.plistPath = path.resolve('/Library/LaunchDaemons/', this.plistName + '.plist');
  }

  /**
   * Installs the launchctl service
   */
  public async install() {
    this.checkForRoot();
    await this.hbService.storagePathCheck();
    await this.hbService.configCheck();

    try {
      await this.createLaunchAgent();
      await this.start();
      this.hbService.printPostInstallInstructions();
    } catch (e) {
      console.error(e.toString());
    }
  }

  /**
   * Removes the launchctl service
   */
  public async uninstall() {
    this.checkForRoot();
    await this.stop();

    try {
      if (fs.existsSync(this.plistPath)) {
        this.hbService.logger(`Removed ${this.hbService.serviceName} Service.`);
        fs.unlinkSync(this.plistPath);
      } else {
        this.hbService.logger(`Could not find installed ${this.hbService.serviceName} Service.`);
      }
    } catch (e) {
      console.error(e.toString());
      this.hbService.logger(`ERROR: Failed Operation`);
    }
  }

  /**
   * Starts the launchctl service
   */
  public async start() {
    this.checkForRoot();
    try {
      this.hbService.logger(`Starting ${this.hbService.serviceName} Service...`);
      child_process.execSync(`launchctl load -w ${this.plistPath}`);
      this.hbService.logger(`${this.hbService.serviceName} Started`);
    } catch (e) {
      this.hbService.logger(`Failed to start ${this.hbService.serviceName}`);
    }
  }

  /**
   * Stops the launchctl service
   */
  public async stop() {
    this.checkForRoot();
    try {
      this.hbService.logger(`Stopping ${this.hbService.serviceName} Service...`);
      child_process.execSync(`launchctl unload -w ${this.plistPath}`);
      this.hbService.logger(`${this.hbService.serviceName} Stopped`);
    } catch (e) {
      this.hbService.logger(`Failed to stop ${this.hbService.serviceName}`);
    }
  }

  /**
   * Restarts the launchctl service
   */
  public async restart() {
    this.checkForRoot();
    await this.stop();
    setTimeout(async () => {
      await this.start();
    }, 2000);
  }

  /**
   * Returns the users uid and gid.
   */
  public async getId(): Promise<{ uid: number, gid: number }> {
    if (process.getuid() === 0 && process.env.SUDO_USER) {
      const uid = child_process.execSync(`id -u ${process.env.SUDO_USER}`).toString('utf8');
      const gid = child_process.execSync(`id -g ${process.env.SUDO_USER}`).toString('utf8');
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
   * Check the command is being run as root and we can detect the user
   */
  private checkForRoot() {
    if (process.getuid() !== 0) {
      this.hbService.logger('ERROR: This command must be executed using sudo on macOS');
      this.hbService.logger(`sudo hb-service ${this.hbService.action}`);
      process.exit(1);
    }
    if (!process.env.SUDO_USER) {
      this.hbService.logger('ERROR: Could not detect user');
      process.exit(1);
    }
    this.user = process.env.SUDO_USER;
  }

  /**
   * Create the system launch agent
   */
  private async createLaunchAgent() {
    const plistFileContents = [
      `<?xml version="1.0" encoding="UTF-8"?>`,
      `<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">`,
      `<plist version="1.0">`,
      `<dict>`,
      `    <key>RunAtLoad</key>`,
      `        <true/>`,
      `    <key>KeepAlive</key>`,
      `        <true/>`,
      `    <key>Label</key>`,
      `        <string>${this.plistName}</string>`,
      `    <key>ProgramArguments</key>`,
      `        <array>`,
      `             <string>${process.execPath}</string>`,
      `             <string>${this.hbService.selfPath}</string>`,
      `             <string>run</string>`,
      `             <string>-U</string>`,
      `             <string>${this.hbService.storagePath}</string>`,
      `        </array>`,
      `    <key>StandardOutPath</key>`,
      `        <string>${this.hbService.storagePath}/homebridge.log</string>`,
      `    <key>StandardErrorPath</key>`,
      `        <string>${this.hbService.storagePath}/homebridge.log</string>`,
      `    <key>UserName</key>`,
      `        <string>${this.user}</string>`,
      `    <key>EnvironmentVariables</key>`,
      `        <dict>`,
      `            <key>PATH</key>`,
      `                <string>${process.env.PATH}</string>`,
      `            <key>HOME</key>`,
      `                <string>${os.homedir()}</string>`,
      `            <key>UIX_STORAGE_PATH</key>`,
      `                <string>${this.hbService.storagePath}</string>`,
      `        </dict>`,
      `</dict>`,
      `</plist>`,
    ].join('\n');

    await fs.writeFile(this.plistPath, plistFileContents);
  }
}
#!/usr/bin/env node

/**
 * The purpose of this file is to run and install homebridge and homebridge-config-ui-x as a service on Windows 10
 * This may be expanded to other operating systems in the future
 */

import * as os from 'os';
import * as path from 'path';
import * as commander from 'commander';
import * as child_process from 'child_process';
import * as fs from 'fs-extra';

import { Win32Installer } from './platforms/win32';
import { LinuxInstaller } from './platforms/linux';
import { DarwinInstaller } from './platforms/darwin';

export class HomebridgeServiceHelper {
  public action: string;
  public selfPath = __filename;
  public serviceName = 'Homebridge';
  public storagePath = path.resolve(os.homedir(), '.homebridge');
  private allowRunRoot = false;
  private logPath: string;
  private log: fs.WriteStream;
  private homebridgeBinary: string;
  private homebridge: child_process.ChildProcessWithoutNullStreams;
  private uiBinary: string;

  public uiPort = 8080;

  private installer: Win32Installer | LinuxInstaller | DarwinInstaller;

  constructor() {
    // select the installer for the current platform
    switch (os.platform()) {
      case 'linux':
        this.installer = new LinuxInstaller(this);
        break;
      case 'win32':
        this.installer = new Win32Installer(this);
        break;
      case 'darwin':
        this.installer = new DarwinInstaller(this);
        break;
      default:
        this.logger(`ERROR: This command is not supported on ${os.platform()}.`);
        process.exit(1);
    }

    commander
      .allowUnknownOption()
      .option('-U, --user-storage-path [path]', '', (p) => this.storagePath = p)
      .option('-P, --plugin-path [path]', '', (p) => process.env.UIX_CUSTOM_PLUGIN_PATH = p)
      .option('-I, --insecure', '', () => process.env.UIX_INSECURE_MODE = '1')
      .option('-T, --no-timestamp', '', () => process.env.UIX_LOG_NO_TIMESTAMPS = '1')
      .option('-S, --service-name [service name]', '', (p) => this.serviceName = p)
      .option('--allow-root', '', () => this.allowRunRoot = true)
      .arguments('<install|uninstall|start|stop|restart|run>')
      .action((cmd) => {
        this.action = cmd;
      })
      .parse(process.argv);

    this.setEnv();

    switch (this.action) {
      case 'install': {
        this.logger(`Installing ${this.serviceName} Service`);
        this.installer.install();
        break;
      }
      case 'uninstall': {
        this.logger(`Removing ${this.serviceName} Service`);
        this.installer.uninstall();
        break;
      }
      case 'start': {
        this.logger(`Starting ${this.serviceName} Service`);
        this.installer.start();
        break;
      }
      case 'stop': {
        this.logger(`Stopping ${this.serviceName} Service`);
        this.installer.stop();
        break;
      }
      case 'restart': {
        this.logger(`Restart ${this.serviceName} Service`);
        this.installer.restart();
        break;
      }
      case 'run': {
        this.launch();
        break;
      }
      default: {
        commander.outputHelp();

        console.log('\nThe hb-service command is provided by homebridge-config-ui-x\n');
        console.log('Please provide a command:');
        console.log('    install                          install homebridge as a service');
        console.log('    uninstall                        remove the homebridge service');
        console.log('    start                            start the homebridge service');
        console.log('    stop                             stop the homebridge service');
        console.log('    restart                          restart the homebridge service');
        console.log('    run                              run homebridge daemon');

        process.exit(1);
      }
    }
  }

  /**
   * Logger function, log to homebridge.log file when possible
   */
  public logger(msg) {
    msg = `\x1b[37m[${new Date().toLocaleString()}]\x1b[0m ` +
      '\x1b[36m[HB Supervisor]\x1b[0m ' + msg;
    if (this.log) {
      this.log.write(msg + '\n');
    } else {
      console.log(msg);
    }
  }

  /**
   * Sets the required environment variables passed on to the child processes
   */
  private setEnv() {
    process.env.UIX_STORAGE_PATH = this.storagePath;
    process.env.UIX_CONFIG_PATH = path.resolve(this.storagePath, 'config.json');
    process.env.UIX_BASE_PATH = path.resolve(__dirname, '../../');
    process.env.UIX_SERVICE_MODE = '1';
  }

  /**
   * Launch script, starts homebridge and homebridge-config-ui-x
   */
  private async launch() {
    if (os.platform() !== 'win32' && process.getuid() === 0 && !this.allowRunRoot) {
      this.logger('The hb-service run command should not be executed as root.');
      this.logger('Use the --allow-root flag to force the service to run as the root user.');
      process.exit(0);
    }

    // check storage path exists
    await this.storagePathCheck();

    // work out the log path
    this.logPath = path.resolve(this.storagePath, 'homebridge.log');
    this.logger(`Logging to ${this.logPath}`);

    // redirect all stdout to the log file
    this.log = fs.createWriteStream(this.logPath, { flags: 'a' });
    process.stdout.write = process.stderr.write = this.log.write.bind(this.log);

    // verify the config
    await this.configCheck();

    // work out the homebridge binary path
    const node_modules = path.resolve(process.env.UIX_BASE_PATH, '..');
    this.homebridgeBinary = path.resolve(node_modules, 'homebridge', 'bin', 'homebridge');
    this.logger(`Homebridge Path: ${this.homebridgeBinary}`);

    // get the standalone ui binary on this system
    this.uiBinary = path.resolve(process.env.UIX_BASE_PATH, 'dist', 'bin', 'standalone.js');
    this.logger(`UI Path: ${this.uiBinary}`);

    // start homebridge
    this.runHomebridge();
    this.runUi();
  }

  /**
   * Starts homebridge as a child process, sending the log output to the homebridge.log
   */
  private runHomebridge() {
    // handle exit signals
    process.on('SIGINT', (code) => {
      this.logger('Got SIGINT, shutting down...');
      setTimeout(() => {
        process.exit(1282);
      }, 5100);
    });

    process.on('SIGTERM', (code) => {
      this.logger('Got SIGTERM, shutting down...');
      setTimeout(() => {
        process.exit(12815);
      }, 5100);
    });

    // launch the homebridge process
    this.homebridge = child_process.spawn(process.execPath,
      [
        this.homebridgeBinary,
        '-I',
        '-C',
        '-U',
        this.storagePath,
      ],
      {
        env: process.env,
        windowsHide: true,
      },
    );

    this.logger(`Started Homebridge with PID: ${this.homebridge.pid}`);

    this.homebridge.stdout.on('data', (data) => {
      this.log.write(data);
    });

    this.homebridge.stderr.on('data', (data) => {
      this.log.write(data);
    });

    this.homebridge.on('close', (code, signal) => {
      this.handleHomebridgeClose(code, signal);
    });
  }

  /**
   * Ensures homebridge is restarted automatically if it crashed or was stopped
   * @param code
   * @param signal
   */
  private handleHomebridgeClose(code: number, signal: string) {
    this.logger(`Homebridge Process Ended. Code: ${code}, Signal: ${signal}`);
    setTimeout(() => {
      this.logger('Restarting Homebridge...');
      this.runHomebridge();
    }, 5000);
  }

  /**
   * Start the user interface
   */
  private async runUi() {
    await import('../main');
  }

  /**
   * Prints usage information to the screen after installations
   */
  public printPostInstallInstructions() {
    console.log(`\nManage Homebridge by going to http://localhost:${this.uiPort} in your browser`);
    console.log(`Default Username: admin`);
    console.log(`Default Password: admin\n`);
  }

  /**
   * Ensures the storage path defined exists
   */
  public async storagePathCheck() {
    if (!await fs.pathExists(this.storagePath)) {
      this.logger(`Creating Homebridge directory: ${this.storagePath}`);
      await fs.mkdirp(this.storagePath);
      await this.chownPath(this.storagePath);
    }
  }

  /**
   * Ensures the config.json exists and is valid.
   * If the config is not valid json it will be backed up and replaced with the default.
   */
  public async configCheck() {
    if (!await fs.pathExists(process.env.UIX_CONFIG_PATH)) {
      this.logger(`Creating default config.json: ${process.env.UIX_CONFIG_PATH}`);
      return await this.createDefaultConfig();
    }

    try {
      await fs.readJson(process.env.UIX_CONFIG_PATH);
    } catch (e) {
      const backupFile = path.resolve(this.storagePath, 'config.json.invalid.' + new Date().getTime().toString());
      this.logger(`${process.env.UIX_CONFIG_PATH} does not contain valid JSON.`);
      this.logger(`Invalid config.json file has been backed up to ${backupFile}.`);
      await fs.rename(process.env.UIX_CONFIG_PATH, backupFile);
      await this.createDefaultConfig();
    }
  }

  /**
   * Creates the default config.json
   */
  public async createDefaultConfig() {
    await fs.writeJson(process.env.UIX_CONFIG_PATH, {
      bridge: {
        name: this.serviceName,
        username: this.generateUsername(),
        port: Math.floor(Math.random() * (52000 - 51000 + 1) + 51000),
        pin: this.generatePin(),
      },
      accessories: [],
      platforms: [
        {
          name: 'Config',
          port: this.uiPort,
          platform: 'config',
        },
      ],
    }, { spaces: 4 });
    await this.chownPath(process.env.UIX_CONFIG_PATH);
  }

  /**
   * Generates a new random pin
   */
  private generatePin() {
    let code: string | Array<any> = Math.floor(10000000 + Math.random() * 90000000) + '';
    code = code.split('');
    code.splice(3, 0, '-');
    code.splice(6, 0, '-');
    code = code.join('');
    return code;
  }

  /**
   * Generates a new random username
   */
  private generateUsername() {
    const hexDigits = '0123456789ABCDEF';
    let username = '0E:';
    for (let i = 0; i < 5; i++) {
      username += hexDigits.charAt(Math.round(Math.random() * 15));
      username += hexDigits.charAt(Math.round(Math.random() * 15));
      if (i !== 4) {
        username += ':';
      }
    }
    return username;
  }

  /**
   * Corrects the permissions on files when running the hb-service command using sudo
   */
  private async chownPath(pathToChown: fs.PathLike) {
    if (os.platform() !== 'win32' && process.getuid() === 0) {
      const { uid, gid } = await this.installer.getId();
      fs.chownSync(pathToChown, uid, gid);
    }
  }

}

function bootstrap() {
  return new HomebridgeServiceHelper();
}

bootstrap();
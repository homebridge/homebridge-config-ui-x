#!/usr/bin/env node

/**
 * The purpose of this file is to run homebridge and homebridge-config-ui-x as a service on Windows 10
 */

import * as os from 'os';
import * as path from 'path';
import * as request from 'request';
import * as commander from 'commander';
import * as child_process from 'child_process';
import * as fs from 'fs-extra';

/**
 * We are using environment variables as they are passed through to the child processes env.
 */
commander
  .allowUnknownOption()
  .option('-U, --user-storage-path [path]', '', (p) => process.env.UIX_STORAGE_PATH = p)
  .option('-P, --plugin-path [path]', '', (p) => process.env.UIX_CUSTOM_PLUGIN_PATH = p)
  .option('-I, --insecure', '', () => process.env.UIX_INSECURE_MODE = '1')
  .option('-T, --no-timestamp', '', () => process.env.UIX_LOG_NO_TIMESTAMPS = '1')
  .option('--service-name [service name]', '', (p) => process.env.UIX_SERVICE_NAME = p)
  .option('install', '')
  .option('uninstall', '')
  .option('start', '')
  .option('stop', '')
  .option('restart', '')
  .parse(process.argv);

if (!process.env.UIX_STORAGE_PATH) {
  process.env.UIX_STORAGE_PATH = path.resolve(os.homedir(), '.homebridge');
}

if (!process.env.UIX_SERVICE_NAME) {
  process.env.UIX_SERVICE_NAME = 'Homebridge';
}

process.env.UIX_CONFIG_PATH = path.resolve(process.env.UIX_STORAGE_PATH, 'config.json');
process.env.UIX_BASE_PATH = path.resolve(__dirname, '../../');
process.env.UIX_SERVICE_MODE = '1';

class HomebridgeService {
  logPath: string;
  log: fs.WriteStream;
  homebridgeBinary: string;
  homebridge: child_process.ChildProcessWithoutNullStreams;
  uiBinary: string;
  ui: child_process.ChildProcessWithoutNullStreams;

  constructor() { }

  /**
   * Logger function, log to homebridge.log file when possible
   */
  logger(msg) {
    msg = `\x1b[37m[${new Date().toLocaleString()}]\x1b[0m ` +
      '\x1b[36m[HB Supervisor]\x1b[0m ' + msg;
    if (this.log) {
      this.log.write(msg + '\n');
    } else {
      console.log(msg);
    }
  }

  /**
   * Launch script, starts homebridge and homebridge-config-ui-x
   */
  async launch() {
    // check storage path exists
    await this.storagePathCheck();

    // work out the log path and create a writable stream
    this.logPath = path.resolve(process.env.UIX_STORAGE_PATH, 'homebridge.log');
    this.log = fs.createWriteStream(this.logPath, {
      flags: 'a',
    });

    // redirect all stdout to the log file
    this.logger(`Logging to ${this.logPath}`);
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
  runHomebridge() {
    // launch the homebridge process
    this.homebridge = child_process.spawn(process.execPath,
      [
        this.homebridgeBinary,
        '-I',
        '-C',
        '-U',
        process.env.UIX_STORAGE_PATH,
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
  handleHomebridgeClose(code: number, signal: string) {
    this.logger(`Homebridge Process Ended. Code: ${code}, Signal: ${signal}`);
    setTimeout(() => {
      this.logger('Restarting Homebridge...');
      this.runHomebridge();
    }, 5000);
  }

  /**
   * Start the user interface
   */
  async runUi() {
    await import('../main');
  }

  /**
   * Windows Only!
   * Installs Homebridge and Homebridge Config UI X as a Windows 10 service
   */
  async install() {
    await this.storagePathCheck();
    await this.configCheck();

    // windows only for now
    if (os.platform() !== 'win32' || os.arch() !== 'x64') {
      this.logger('ERROR: Installing Homebridge as a service using this method is only supported on Windows x64.');
      process.exit(1);
    }

    // download nssm.exe to help create the service
    const nssmPath: string = await this.downloadNssm();

    // commands to run
    const installCmd = `${nssmPath} install ${process.env.UIX_SERVICE_NAME} ` +
      `"${process.execPath}" "${__filename}" -I -U ${process.env.UIX_STORAGE_PATH}`;
    const setUserDirCmd = `${nssmPath} set ${process.env.UIX_SERVICE_NAME} AppEnvironmentExtra ":UIX_STORAGE_PATH=${process.env.UIX_STORAGE_PATH}"`;

    try {
      child_process.execSync(installCmd);
      child_process.execSync(setUserDirCmd);
    } catch (e) {
      console.error(e.toString());
      this.logger(`ERROR: Failed Operation`);
    }
    // start the service
    await this.start();
  }

  /**
   * Windows Only!
   * Removes the Homebridge Service
   */
  async uninstall() {
    // windows only for now
    if (os.platform() !== 'win32' || os.arch() !== 'x64') {
      this.logger('ERROR: Installing Homebridge as a service using this method is only supported on Windows x64.');
      process.exit(1);
    }

    // download nssm.exe to help create the service
    const nssmPath: string = await this.downloadNssm();
    const uninstallCmd = `${nssmPath} remove ${process.env.UIX_SERVICE_NAME} confirm`;

    // stop existing service
    await this.stop();

    try {
      child_process.execSync(uninstallCmd);
      this.logger(`Removed ${process.env.UIX_SERVICE_NAME} Service.`);
    } catch (e) {
      console.error(e.toString());
      this.logger(`ERROR: Failed Operation`);
    }
  }

  /**
   * Windows Only!
   * Starts the Homebridge Service
   */
  async start() {
    // download nssm.exe to help create the service
    const nssmPath: string = await this.downloadNssm();

    // commands to run
    const stopCmd = `${nssmPath} start ${process.env.UIX_SERVICE_NAME}`;

    try {
      this.logger(`Starting ${process.env.UIX_SERVICE_NAME} Service...`);
      child_process.execSync(stopCmd);
      this.logger(`${process.env.UIX_SERVICE_NAME} Started`);
    } catch (e) {
      this.logger(`Failed to start ${process.env.UIX_SERVICE_NAME}`);
    }
  }

  /**
   * Windows Only!
   * Stops the Homebridge Service
   */
  async stop() {
    // download nssm.exe to help create the service
    const nssmPath: string = await this.downloadNssm();

    // commands to run
    const stopCmd = `${nssmPath} stop ${process.env.UIX_SERVICE_NAME}`;

    try {
      this.logger(`Stopping ${process.env.UIX_SERVICE_NAME} Service...`);
      child_process.execSync(stopCmd);
      this.logger(`${process.env.UIX_SERVICE_NAME} Stopped`);
    } catch (e) {
      this.logger(`Failed to stop ${process.env.UIX_SERVICE_NAME}`);
    }
  }

  /**
   * Windows Only!
   * Restarts the Homebridge Service
   */
  async restart() {
    await this.stop();
    setTimeout(async () => {
      await this.start();
    }, 3000);
  }

  /**
   * Windows Only!
   * Downloads nssm - NSSM - the Non-Sucking Service Manager - https://nssm.cc/
   * This is used to create the Windows Services
   */
  async downloadNssm(): Promise<string> {
    const downloadUrl = 'https://github.com/oznu/nssm/releases/download/2.24-101-g897c7ad/nssm.exe';
    const nssmPath = path.resolve(process.env.UIX_STORAGE_PATH, 'nssm.exe');

    if (await fs.pathExists(nssmPath)) {
      return nssmPath;
    }

    const nssmFile = fs.createWriteStream(nssmPath);

    this.logger(`Downloading NSSM from ${downloadUrl}`);

    return new Promise((resolve, reject) => {
      request({
        url: downloadUrl,
        method: 'GET',
        encoding: null,
      }).pipe(nssmFile)
        .on('finish', () => {
          return resolve(nssmPath);
        })
        .on('error', (err) => {
          return reject(err);
        });
    });
  }

  /**
   * Ensures the storage path defined exists
   */
  async storagePathCheck() {
    if (!await fs.pathExists(process.env.UIX_STORAGE_PATH)) {
      this.logger(`Creating Homebridge directory: ${process.env.UIX_STORAGE_PATH}`);
      await fs.mkdirp(process.env.UIX_STORAGE_PATH);
    }
  }

  /**
   * Ensures the config.json exists and is valid.
   * If the config is not valid json it will be backed up and replaced with the default.
   */
  async configCheck() {
    if (!await fs.pathExists(process.env.UIX_CONFIG_PATH)) {
      this.logger(`Creating default config.json: ${process.env.UIX_CONFIG_PATH}`);
      return await this.createDefaultConfig();
    }

    try {
      await fs.readJson(process.env.UIX_CONFIG_PATH);
    } catch (e) {
      const backupFile = path.resolve(process.env.UIX_STORAGE_PATH, 'config.json.invalid.' + new Date().getTime().toString());
      this.logger(`${process.env.UIX_CONFIG_PATH} does not contain valid JSON.`);
      this.logger(`Invalid config.json file has been backed up to ${backupFile}.`);
      await fs.rename(process.env.UIX_CONFIG_PATH, backupFile);
      await this.createDefaultConfig();
    }
  }

  /**
   * Creates the default config.json
   */
  async createDefaultConfig() {
    await fs.writeJson(process.env.UIX_CONFIG_PATH, {
      bridge: {
        name: process.env.UIX_SERVICE_NAME,
        username: this.generateUsername(),
        port: Math.floor(Math.random() * (52000 - 51000 + 1) + 51000),
        pin: this.generatePin(),
      },
      accessories: [],
      platforms: [
        {
          name: 'Config',
          port: 8080,
          platform: 'config',
        },
      ],
    }, { spaces: 4 });
  }

  /**
   * Checks the OS is supported
   */
  osCheck() {
    // windows only for now
    if (os.platform() !== 'win32' || os.arch() !== 'x64') {
      this.logger('ERROR: Installing Homebridge as a service using this method is only supported on Windows x64.');
      process.exit(1);
    }
  }

  /**
   * Generates a new random pin
   */
  public generatePin() {
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
  public generateUsername() {
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

}

async function bootstrap() {
  const homebridgeService = new HomebridgeService();
  if (commander.install) {
    homebridgeService.osCheck();
    homebridgeService.logger(`Installing ${process.env.UIX_SERVICE_NAME} Service`);
    homebridgeService.install();
  } else if (commander.uninstall) {
    homebridgeService.osCheck();
    homebridgeService.logger(`Removing ${process.env.UIX_SERVICE_NAME} Service`);
    homebridgeService.uninstall();
  } else if (commander.start) {
    homebridgeService.osCheck();
    homebridgeService.logger(`Starting ${process.env.UIX_SERVICE_NAME} Service`);
    homebridgeService.start();
  } else if (commander.stop) {
    homebridgeService.osCheck();
    homebridgeService.logger(`Stopping ${process.env.UIX_SERVICE_NAME} Service`);
    homebridgeService.stop();
  } else if (commander.restart) {
    homebridgeService.osCheck();
    homebridgeService.logger(`Restart ${process.env.UIX_SERVICE_NAME} Service`);
    homebridgeService.restart();
  } else {
    homebridgeService.launch();
  }
}

bootstrap();
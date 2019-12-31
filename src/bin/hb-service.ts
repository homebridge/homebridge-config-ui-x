#!/usr/bin/env node

/**
 * The purpose of this file is to run and install homebridge and homebridge-config-ui-x as a service on Windows 10
 * This may be expanded to other operating systems in the future
 */

import * as os from 'os';
import * as path from 'path';
import * as request from 'request';
import * as commander from 'commander';
import * as child_process from 'child_process';
import * as fs from 'fs-extra';

class HomebridgeServiceHelper {
  private action: string;
  private serviceName = 'Homebridge';
  private storagePath = path.resolve(os.homedir(), '.homebridge');
  private logPath: string;
  private log: fs.WriteStream;
  private homebridgeBinary: string;
  private homebridge: child_process.ChildProcessWithoutNullStreams;
  private uiBinary: string;

  private uiPort = 8080;

  constructor() {
    commander
      .allowUnknownOption()
      .option('-U, --user-storage-path [path]', '', (p) => this.storagePath = p)
      .option('-P, --plugin-path [path]', '', (p) => process.env.UIX_CUSTOM_PLUGIN_PATH = p)
      .option('-I, --insecure', '', () => process.env.UIX_INSECURE_MODE = '1')
      .option('-T, --no-timestamp', '', () => process.env.UIX_LOG_NO_TIMESTAMPS = '1')
      .option('-S, --service-name [service name]', '', (p) => this.serviceName = p)
      .arguments('<install|uninstall|start|stop|restart|run>')
      .action((cmd) => {
        this.action = cmd;
      })
      .parse(process.argv);

    this.osCheck();
    this.setEnv();

    switch (this.action) {
      case 'install': {
        this.logger(`Installing ${this.serviceName} Service`);
        this.install();
        break;
      }
      case 'uninstall': {
        this.logger(`Removing ${this.serviceName} Service`);
        this.uninstall();
        break;
      }
      case 'start': {
        this.logger(`Starting ${this.serviceName} Service`);
        this.start();
        break;
      }
      case 'stop': {
        this.logger(`Stopping ${this.serviceName} Service`);
        this.stop();
        break;
      }
      case 'restart': {
        this.logger(`Restart ${this.serviceName} Service`);
        this.restart();
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
  private logger(msg) {
    msg = `\x1b[37m[${new Date().toLocaleString()}]\x1b[0m ` +
      '\x1b[36m[HB Supervisor]\x1b[0m ' + msg;
    if (this.log) {
      this.log.write(msg + '\n');
    } else {
      console.log(msg);
    }
  }

  /**
   * Checks the OS is supported
   */
  private osCheck() {
    // windows only for now
    if (os.platform() !== 'win32') {
      this.logger('ERROR: This command is only supported on Windows 10.');
      process.exit(1);
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
   * Windows Only!
   * Installs Homebridge and Homebridge Config UI X as a Windows 10 service
   */
  private async install() {
    await this.storagePathCheck();
    await this.configCheck();

    // download nssm.exe to help create the service
    const nssmPath: string = await this.downloadNssm();

    // commands to run
    const installCmd = `"${nssmPath}" install ${this.serviceName} ` +
      `"${process.execPath}" "${__filename}" run -I -U "${this.storagePath}"`;
    const setUserDirCmd = `"${nssmPath}" set ${this.serviceName} AppEnvironmentExtra ":UIX_STORAGE_PATH=${this.storagePath}"`;

    try {
      child_process.execSync(installCmd);
      child_process.execSync(setUserDirCmd);
      await this.configureFirewall();
      await this.start();
      console.log(`\nManage Homebridge by going to http://localhost:${this.uiPort} in your browser`);
      console.log(`Default Username: admin`);
      console.log(`Default Password: admin\n`);
    } catch (e) {
      console.error(e.toString());
      this.logger(`ERROR: Failed Operation`);
    }
  }

  /**
   * Windows Only!
   * Removes the Homebridge Service
   */
  private async uninstall() {
    // download nssm.exe to help create the service
    const nssmPath: string = await this.downloadNssm();
    const uninstallCmd = `"${nssmPath}" remove ${this.serviceName} confirm`;

    // stop existing service
    await this.stop();

    try {
      child_process.execSync(uninstallCmd);
      this.logger(`Removed ${this.serviceName} Service.`);
    } catch (e) {
      console.error(e.toString());
      this.logger(`ERROR: Failed Operation`);
    }
  }

  /**
   * Windows Only!
   * Starts the Homebridge Service
   */
  private async start() {
    // download nssm.exe to help create the service
    const nssmPath: string = await this.downloadNssm();

    // commands to run
    const stopCmd = `"${nssmPath}" start ${this.serviceName}`;

    try {
      this.logger(`Starting ${this.serviceName} Service...`);
      child_process.execSync(stopCmd);
      this.logger(`${this.serviceName} Started`);
    } catch (e) {
      this.logger(`Failed to start ${this.serviceName}`);
    }
  }

  /**
   * Windows Only!
   * Stops the Homebridge Service
   */
  private async stop() {
    // download nssm.exe to help create the service
    const nssmPath: string = await this.downloadNssm();

    // commands to run
    const stopCmd = `"${nssmPath}" stop ${this.serviceName}`;

    try {
      this.logger(`Stopping ${this.serviceName} Service...`);
      child_process.execSync(stopCmd);
      this.logger(`${this.serviceName} Stopped`);
    } catch (e) {
      this.logger(`Failed to stop ${this.serviceName}`);
    }
  }

  /**
   * Windows Only!
   * Restarts the Homebridge Service
   */
  private async restart() {
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
  private async downloadNssm(): Promise<string> {
    const downloadUrl = `https://github.com/oznu/nssm/releases/download/2.24-101-g897c7ad/nssm_${os.arch()}.exe`;
    const nssmPath = path.resolve(this.storagePath, 'nssm.exe');

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
   * Ensures the Node.js process is allowed to accept incoming connections
   */
  private async configureFirewall() {
    // firewall commands
    const cleanFirewallCmd = `netsh advfirewall firewall Delete rule name="Homebridge"`;
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
      this.logger(`Failed to configure firewall rule for Homebridge.`);
      this.logger(e);
    }
  }

  /**
   * Ensures the storage path defined exists
   */
  private async storagePathCheck() {
    if (!await fs.pathExists(this.storagePath)) {
      this.logger(`Creating Homebridge directory: ${this.storagePath}`);
      await fs.mkdirp(this.storagePath);
    }
  }

  /**
   * Ensures the config.json exists and is valid.
   * If the config is not valid json it will be backed up and replaced with the default.
   */
  private async configCheck() {
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
  private async createDefaultConfig() {
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

}

function bootstrap() {
  return new HomebridgeServiceHelper();
}

bootstrap();
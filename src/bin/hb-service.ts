#!/usr/bin/env node

/**
 * The purpose of this file is to run and install homebridge and homebridge-config-ui-x as a service
 */

process.title = 'hb-service';

import * as os from 'os';
import * as path from 'path';
import * as commander from 'commander';
import * as child_process from 'child_process';
import * as fs from 'fs-extra';
import * as tcpPortUsed from 'tcp-port-used';
import * as si from 'systeminformation';
import * as semver from 'semver';
import * as ora from 'ora';
import * as tar from 'tar';
import axios from 'axios';
import { Tail } from 'tail';

import { Win32Installer } from './platforms/win32';
import { LinuxInstaller } from './platforms/linux';
import { DarwinInstaller } from './platforms/darwin';

export class HomebridgeServiceHelper {
  public action: 'install' | 'uninstall' | 'start' | 'stop' | 'restart' | 'rebuild' | 'run' | 'logs' | 'update-node' | 'before-start' | 'status';
  public selfPath = __filename;
  public serviceName = 'Homebridge';
  public storagePath;
  public usingCustomStoragePath = false;
  public allowRunRoot = false;
  public asUser;
  private log: fs.WriteStream | NodeJS.WriteStream;
  private homebridgeModulePath: string;
  private homebridgePackage: { version: string; bin: { homebridge: string } };
  private homebridgeBinary: string;
  private homebridge: child_process.ChildProcessWithoutNullStreams;
  private homebridgeStopped = true;
  private homebridgeOpts = ['-I'];
  private homebridgeCustomEnv = {};
  private uiBinary: string;

  // send logs to stdout instead of the homebridge.log
  private stdout: boolean;

  // oznu/docker-homebridge options
  public docker: boolean;
  private uid: number;
  private gid: number;

  public uiPort = 8581;

  private installer: Win32Installer | LinuxInstaller | DarwinInstaller;

  get logPath(): string {
    return path.resolve(this.storagePath, 'homebridge.log');
  }

  constructor() {
    // check the node.js version
    this.nodeVersionCheck();

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
        this.logger(`ERROR: This command is not supported on ${os.platform()}.`, 'fail');
        process.exit(1);
    }

    commander
      .allowUnknownOption()
      .storeOptionsAsProperties(true)
      .arguments('[install|uninstall|start|stop|restart|rebuild|run|logs]')
      .option('-P, --plugin-path <path>', '', (p) => { process.env.UIX_CUSTOM_PLUGIN_PATH = p; this.homebridgeOpts.push('-P', p); })
      .option('-U, --user-storage-path <path>', '', (p) => { this.storagePath = p; this.usingCustomStoragePath = true; })
      .option('-S, --service-name <service name>', 'The name of the homebridge service to install or control', (p) => this.serviceName = p)
      .option('--port <port>', 'The port to set to the Homebridge UI when installing as a service', (p) => this.uiPort = parseInt(p, 10))
      .option('--user <user>', 'The user account the Homebridge service will be installed as (Linux, macOS only)', (p) => this.asUser = p)
      .option('--stdout', '', () => this.stdout = true)
      .option('--allow-root', '', () => this.allowRunRoot = true)
      .option('--docker', '', () => this.docker = true)
      .option('--uid <number>', '', (i) => this.uid = parseInt(i, 10))
      .option('--gid <number>', '', (i) => this.gid = parseInt(i, 10))
      .option('-v, --version', 'output the version number', () => this.showVersion())
      .action((cmd) => {
        this.action = cmd;
      })
      .parse(process.argv);

    this.setEnv();

    switch (this.action) {
      case 'install': {
        this.nvmCheck();
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
        this.installer.start();
        break;
      }
      case 'stop': {
        this.installer.stop();
        break;
      }
      case 'restart': {
        this.logger(`Restarting ${this.serviceName} Service`);
        this.installer.restart();
        break;
      }
      case 'rebuild': {
        this.logger(`Rebuilding for Node.js ${process.version}...`);
        this.installer.rebuild(commander.args.includes('--all'));
        break;
      }
      case 'run': {
        this.launch();
        break;
      }
      case 'logs': {
        this.tailLogs();
        break;
      }
      case 'update-node': {
        this.checkForNodejsUpdates(commander.args.length === 2 ? commander.args[1] : null);
        break;
      }
      case 'before-start': {
        // this currently does nothing, but may be used in the future
        process.exit(0);
        break;
      }
      case 'status': {
        this.checkStatus();
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
        console.log('    rebuild                          rebuild ui');
        console.log('    rebuild --all                    rebuild all npm modules (use after updating Node.js)');
        console.log('    run                              run homebridge daemon');
        console.log('    logs                             tails the homebridge service logs');
        console.log('    update-node [version]            update Node.js');
        console.log('\nSee the wiki for help with hb-service: https://git.io/JTtHK \n');

        process.exit(1);
      }
    }
  }

  /**
   * Logger function, log to homebridge.log file when possible
   */
  public logger(msg, type: 'info' | 'succeed' | 'fail' | 'warn' = 'info') {
    if (this.action === 'run') {
      msg = `\x1b[37m[${new Date().toLocaleString()}]\x1b[0m ` +
        '\x1b[36m[HB Supervisor]\x1b[0m ' + msg;
      if (this.log) {
        this.log.write(msg + '\n');
      } else {
        console.log(msg);
      }
    } else {
      ora()[type](msg);
    }
  }

  /**
   * Sets the required environment variables passed on to the child processes
   */
  private setEnv() {
    // Ensure service name is valid
    if (!this.serviceName.match(/^[a-z0-9-]+$/i)) {
      this.logger('ERROR: Service name must not contain spaces or special characters', 'fail');
      process.exit(1);
    }

    // Setup default storage path
    if (!this.storagePath) {
      if (os.platform() === 'linux') {
        this.storagePath = path.resolve('/var/lib', this.serviceName.toLowerCase());
      } else {
        this.storagePath = path.resolve(os.homedir(), `.${this.serviceName.toLowerCase()}`);
      }
    }

    // Certain commands are not supported when running in Docker
    if (process.env.CONFIG_UI_VERSION && process.env.HOMEBRIDGE_VERSION && process.env.QEMU_ARCH) {
      if (os.platform() === 'linux' && ['install', 'uninstall', 'start', 'stop', 'restart', 'logs'].includes(this.action)) {
        this.logger(`Sorry, the ${this.action} command is not supported in Docker.`, 'fail');
        process.exit(1);
      }
    }

    // Set Env Vars
    process.env.UIX_STORAGE_PATH = this.storagePath;
    process.env.UIX_CONFIG_PATH = path.resolve(this.storagePath, 'config.json');
    process.env.UIX_BASE_PATH = path.resolve(__dirname, '../../');
    process.env.UIX_SERVICE_MODE = '1';
    process.env.UIX_INSECURE_MODE = '1';
  }

  /**
   * Outputs the package version number
   */
  private showVersion() {
    const pjson = fs.readJsonSync(path.resolve(__dirname, '../../', 'package.json'));
    console.log('v' + pjson.version);
    process.exit(0);
  }

  /**
   * Opens the log file stream
   */
  private async startLog() {
    if (this.stdout === true) {
      this.log = process.stdout;
      return;
    }

    // work out the log path
    this.logger(`Logging to ${this.logPath}`);

    // redirect all stdout to the log file
    this.log = fs.createWriteStream(this.logPath, { flags: 'a' });
    process.stdout.write = process.stderr.write = this.log.write.bind(this.log);
  }

  /**
   * Trucate the log file to prevent large log files
   */
  private async truncateLog() {
    if (!await fs.pathExists(this.logPath) || this.stdout) {
      return;
    }

    const maxSize = 1000000; // ~1 MB
    const truncateSize = 200000; // ~0.2 MB

    try {
      const logStats = await fs.stat(this.logPath);

      if (logStats.size < maxSize) {
        return; // log file does not need truncating
      }

      // read out the last `truncatedSize` bytes to a buffer
      const logStartPosition = logStats.size - truncateSize;
      const logBuffer = Buffer.alloc(truncateSize);
      const logFileHandle = await fs.open(this.logPath, 'r');
      await fs.read(logFileHandle, logBuffer, 0, truncateSize, logStartPosition);
      await fs.close(logFileHandle);

      // truncate the existing file
      await fs.truncate(this.logPath);

      // re-write the truncated log file
      this.log.write(logBuffer);
    } catch (e) {
      this.logger(`Failed to truncate log file: ${e.message}`, 'fail');
    }
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

    this.logger(`Homebridge Storage Path: ${this.storagePath}`);
    this.logger(`Homebridge Config Path: ${process.env.UIX_CONFIG_PATH}`);

    // start the interval to truncate the logs every two hours
    setInterval(() => {
      this.truncateLog();
    }, (1000 * 60 * 60) * 2);

    // pre-start
    try {
      // check storage path exists
      await this.storagePathCheck();

      // start logging to file
      await this.startLog();

      // verify the config
      await this.configCheck();

      // log os info
      this.logger(`OS: ${os.type()} ${os.release()} ${os.arch()}`);
      this.logger(`Node.js ${process.version} ${process.execPath}`);

      // work out the homebridge binary path
      this.homebridgeBinary = await this.findHomebridgePath();
      this.logger(`Homebridge Path: ${this.homebridgeBinary}`);

      // load startup options if they exist
      await this.loadHomebridgeStartupOptions();

      // get the standalone ui binary on this system
      this.uiBinary = path.resolve(process.env.UIX_BASE_PATH, 'dist', 'bin', 'standalone.js');
      this.logger(`UI Path: ${this.uiBinary}`);
    } catch (e) {
      this.logger(e.message);
      process.exit(1);
    }

    // start homebridge
    this.startExitHandler();

    // delay the launch of homebridge on Raspberry Pi 1/Zero by 20 seconds
    if (os.cpus().length === 1 && os.arch() === 'arm') {
      this.logger('Delaying Homebridge startup by 20 seconds on low powered server');
      setTimeout(() => {
        this.runHomebridge();
      }, 20000);
    } else {
      this.runHomebridge();
    }

    // start the ui
    this.runUi();

    process.addListener('message', (event, callback) => {
      switch (event) {
        case 'clearCachedAccessories': {
          return this.clearHomebridgeCachedAccessories(callback);
        }
        case 'deleteSingleCachedAccessory': {
          return this.clearHomebridgeCachedAccessories(callback);
        }
        case 'restartHomebridge': {
          return this.restartHomebridge();
        }
        case 'postBackupRestoreRestart': {
          return this.postBackupRestoreRestart();
        }
        case 'getHomebridgeChildProcess': {
          return this.getHomebridgeChildProcess(callback);
        }
      }
    });
  }

  /**
   * Handles exit event
   */
  private startExitHandler() {
    const exitHandler = () => {
      this.logger('Stopping services...');
      try {
        this.homebridge.kill();
      } catch (e) { }

      setTimeout(() => {
        try {
          this.homebridge.kill('SIGKILL');
        } catch (e) { }
        process.exit(1282);
      }, 7000);
    };

    process.on('SIGTERM', exitHandler);
    process.on('SIGINT', exitHandler);
  }

  /**
   * Starts homebridge as a child process, sending the log output to the homebridge.log
   */
  private runHomebridge() {
    this.homebridgeStopped = false;

    if (!this.homebridgeBinary || !fs.pathExistsSync(this.homebridgeBinary)) {
      this.logger('Could not find Homebridge. Make sure you have installed homebridge using the -g flag then restart.', 'fail');
      this.logger('npm install -g --unsafe-perm homebridge', 'fail');
      return;
    }

    if (this.homebridgeOpts.length) {
      this.logger(`Starting Homebridge with extra flags: ${this.homebridgeOpts.join(' ')}`);
    }

    if (Object.keys(this.homebridgeCustomEnv).length) {
      this.logger(`Starting Homebridge with custom env: ${JSON.stringify(this.homebridgeCustomEnv)}`);
    }

    // env setup
    const env = {};
    Object.assign(env, process.env);
    Object.assign(env, this.homebridgeCustomEnv);

    // child process spawn options
    const childProcessOpts: child_process.ForkOptions = {
      env,
      silent: true,
    };

    // spawn homebridge as a different user (probably for docker)
    if (this.allowRunRoot && this.uid && this.gid) {
      childProcessOpts.uid = this.uid;
      childProcessOpts.gid = this.gid;
    }

    // fix docker permission if running on docker
    if (this.docker) {
      this.fixDockerPermissions();
    }

    // launch the homebridge process
    this.homebridge = child_process.fork(this.homebridgeBinary,
      [
        '-C',
        '-Q',
        '-U',
        this.storagePath,
        ...this.homebridgeOpts,
      ],
      childProcessOpts,
    );

    this.logger(`Started Homebridge v${this.homebridgePackage.version} with PID: ${this.homebridge.pid}`);

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
    this.homebridgeStopped = true;
    this.logger(`Homebridge Process Ended. Code: ${code}, Signal: ${signal}`);

    this.checkForStaleHomebridgeProcess();
    this.refreshHomebridgePackage();

    setTimeout(() => {
      this.logger('Restarting Homebridge...');
      this.runHomebridge();
    }, 5000);
  }

  /**
   * Start the user interface
   */
  private async runUi() {
    try {
      await import('../main');
    } catch (e) {
      this.logger('ERROR: The user interface threw an unhandled error');
      console.error(e);

      setTimeout(() => {
        process.exit(1);
      }, 4500);

      if (this.homebridge) {
        this.homebridge.kill();
      }
    }
  }

  /**
   * Get the global npm directory
   */
  private async getNpmGlobalModulesDirectory() {
    try {
      const npmPrefix = child_process.execSync('npm -g prefix').toString('utf8').trim();
      return os.platform() === 'win32' ? path.join(npmPrefix, 'node_modules') : path.join(npmPrefix, 'lib', 'node_modules');
    } catch (e) {
      return null;
    }
  }

  /**
   * Finds the homebridge binary
   */
  private async findHomebridgePath() {
    // check the folder directly above
    const nodeModules = path.resolve(process.env.UIX_BASE_PATH, '..');
    if (await fs.pathExists(path.resolve(nodeModules, 'homebridge', 'package.json'))) {
      this.homebridgeModulePath = path.resolve(nodeModules, 'homebridge');
    }

    // check the global npm modules directory
    if (!this.homebridgeModulePath) {
      const globalModules = await this.getNpmGlobalModulesDirectory();
      if (globalModules && await fs.pathExists(path.resolve(globalModules, 'homebridge'))) {
        this.homebridgeModulePath = path.resolve(globalModules, 'homebridge');
      }
    }

    if (this.homebridgeModulePath) {
      try {
        await this.refreshHomebridgePackage();
        return path.resolve(this.homebridgeModulePath, this.homebridgePackage.bin.homebridge);
      } catch (e) {
        console.log(e);
      }
    }

    return null;
  }

  /**
   * Refresh the homebridge package.json
   */
  private async refreshHomebridgePackage() {
    try {
      if (await fs.pathExists(this.homebridgeModulePath)) {
        this.homebridgePackage = await fs.readJson(path.join(this.homebridgeModulePath, 'package.json'));
      } else {
        this.logger(`Homebridge not longer found at ${this.homebridgeModulePath}`, 'fail');
        this.homebridgeModulePath = undefined;
        this.homebridgeBinary = await this.findHomebridgePath();
        this.logger(`Found New Homebridge Path: ${this.homebridgeBinary}`);
      }
    } catch (e) {
      console.log(e);
    }
  }

  /**
   * Checks the current Node.js version is > 10
   */
  private nodeVersionCheck() {
    // 64 = v10;
    if (parseInt(process.versions.modules, 10) < 64) {
      this.logger(`ERROR: Node.js v10.13.0 or greater is required. Current: ${process.version}.`, 'fail');
      process.exit(1);
    }
  }

  /**
   * Show a warning if the user is trying to install with NVM on Linux
   */
  private nvmCheck() {
    if (process.execPath.includes('nvm') && os.platform() === 'linux') {
      this.logger(
        'WARNING: It looks like you are running Node.js via NVM (Node Version Manager).\n' +
        '  Using hb-service with NVM may not work unless you have configured NVM for the\n' +
        '  user this service will run as. See https://git.io/JUZ2g for instructions on how\n' +
        '  to remove NVM, then follow the wiki instructions to install Node.js and Homebridge.',
        'warn'
      );
    }
  }

  /**
   * Prints usage information to the screen after installations
   */
  public async printPostInstallInstructions() {
    const defaultAdapter = await si.networkInterfaceDefault();
    const defaultInterface = (await si.networkInterfaces()).find(x => x.iface === defaultAdapter);

    console.log('\nManage Homebridge by going to one of the following in your browser:\n');

    console.log(`* http://localhost:${this.uiPort}`);

    if (defaultInterface && defaultInterface.ip4) {
      console.log(`* http://${defaultInterface.ip4}:${this.uiPort}`);
    }

    if (defaultInterface && defaultInterface.ip6) {
      console.log(`* http://[${defaultInterface.ip6}]:${this.uiPort}`);
    }

    console.log('\nDefault Username: admin');
    console.log('Default Password: admin\n');

    this.logger('Homebridge Setup Complete', 'succeed');
  }

  /**
   * Checks if the port is currently in use by another process
   */
  public async portCheck() {
    const inUse = await tcpPortUsed.check(this.uiPort);
    if (inUse) {
      this.logger(`ERROR: Port ${this.uiPort} is already in use by another process on this host.`, 'fail');
      this.logger('You can specify another port using the --port flag, eg.', 'fail');
      this.logger(`EXAMPLE: hb-service ${this.action} --port 8581`, 'fail');
      process.exit(1);
    }
  }

  /**
   * Ensures the storage path defined exists
   */
  public async storagePathCheck() {
    if (os.platform() === 'darwin' && !await fs.pathExists(path.dirname(this.storagePath))) {
      this.logger(`Cannot create Homebridge storage directory, base path does not exist: ${path.dirname(this.storagePath)}`, 'fail');
      process.exit(1);
    }

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
    let saveRequired = false;
    let restartRequired = false;

    if (!await fs.pathExists(process.env.UIX_CONFIG_PATH)) {
      this.logger(`Creating default config.json: ${process.env.UIX_CONFIG_PATH}`);
      await this.createDefaultConfig();
      restartRequired = true;
    }

    try {
      const currentConfig = await fs.readJson(process.env.UIX_CONFIG_PATH);

      // extract ui config
      if (!Array.isArray(currentConfig.platforms)) {
        currentConfig.platforms = [];
      }
      let uiConfigBlock = currentConfig.platforms.find((x) => x.platform === 'config');

      // if the config block does not exist, then create it
      if (!uiConfigBlock) {
        this.logger(`Adding missing UI platform block to ${process.env.UIX_CONFIG_PATH}`, 'info');
        uiConfigBlock = await this.createDefaultUiConfig();
        currentConfig.platforms.push(uiConfigBlock);
        saveRequired = true;
        restartRequired = true;
      }

      // ensure the port is set
      if (this.action !== 'install' && typeof uiConfigBlock.port !== 'number') {
        uiConfigBlock.port = await this.getLastKnownUiPort();
        this.logger(`Added missing port number to UI config - ${uiConfigBlock.port}`, 'info');
        saveRequired = true;
        restartRequired = true;
      }

      // if doing an install, make sure the port number matches the value passed in by the user
      if (this.action === 'install') {
        // correct the port
        if (uiConfigBlock.port !== this.uiPort) {
          uiConfigBlock.port = this.uiPort;
          this.logger(`WARNING: HOMEBRIDGE CONFIG UI PORT IN ${process.env.UIX_CONFIG_PATH} CHANGED TO ${this.uiPort}`, 'warn');
        }
        // delete unnecessary config
        delete uiConfigBlock.restart;
        delete uiConfigBlock.sudo;
        delete uiConfigBlock.log;
        saveRequired = true;
      }

      // ensure the ui port is defined and is a number
      if (typeof uiConfigBlock.port !== 'number') {
        uiConfigBlock.port = await this.getLastKnownUiPort();
        this.logger(`Added missing port number to UI config - ${uiConfigBlock.port}`, 'info');
        saveRequired = true;
        restartRequired = true;
      }

      // check the bridge section exists
      if (!currentConfig.bridge) {
        currentConfig.bridge = await this.generateBridgeConfig();
        this.logger('Added missing Homebridge bridge section to the config.json', 'info');
        saveRequired = true;
      }

      // ensure port is set in bridge config
      if (!currentConfig.bridge.port) {
        currentConfig.bridge.port = await this.generatePort();
        this.logger(`Added port to the Homebridge bridge section of the config.json: ${currentConfig.bridge.port}`, 'info');
        saveRequired = true;
      }

      // ensure bridge port is not the same as the UI port
      if ((uiConfigBlock && currentConfig.bridge.port === uiConfigBlock.port) || currentConfig.bridge.port === 8080) {
        currentConfig.bridge.port = await this.generatePort();
        this.logger(`Bridge port must not be the same as the UI port. Changing bridge port to ${currentConfig.bridge.port}.`, 'info');
        saveRequired = true;
      }

      // ensure homebridge-config-ui-x is enabled if the plugins array is set
      if (currentConfig.plugins && Array.isArray(currentConfig.plugins)) {
        if (!currentConfig.plugins.includes('homebridge-config-ui-x')) {
          currentConfig.plugins.push('homebridge-config-ui-x');
          this.logger('Added homebridge-config-ui-x to the plugins array in the config.json', 'info');
          saveRequired = true;
        }
      }

      if (saveRequired) {
        await fs.writeJSON(process.env.UIX_CONFIG_PATH, currentConfig, { spaces: 4 });
      }

    } catch (e) {
      const backupFile = path.resolve(this.storagePath, 'config.json.invalid.' + new Date().getTime().toString());
      this.logger(`${process.env.UIX_CONFIG_PATH} does not contain valid JSON.`, 'warn');
      this.logger(`Invalid config.json file has been backed up to ${backupFile}.`, 'warn');
      await fs.rename(process.env.UIX_CONFIG_PATH, backupFile);
      await this.createDefaultConfig();
      restartRequired = true;
    }

    // if the port number potentially changed, we need to restart here when running the
    // raspbian image so the nginx config will be updated
    if (restartRequired && this.action === 'run' && await this.isRaspbianImage()) {
      this.logger('Restarting process after port number update.', 'info');
      process.exit(1);
    }
  }

  /**
   * Creates the default config.json
   */
  public async createDefaultConfig() {
    await fs.writeJson(process.env.UIX_CONFIG_PATH, {
      bridge: await this.generateBridgeConfig(),
      accessories: [],
      platforms: [
        await this.createDefaultUiConfig(),
      ],
    }, { spaces: 4 });
    await this.chownPath(process.env.UIX_CONFIG_PATH);
  }

  /**
   * Create a default Homebridge bridge config
   */
  private async generateBridgeConfig() {
    const username = this.generateUsername();
    const port = await this.generatePort();
    const name = 'Homebridge ' + username.substr(username.length - 5).replace(/:/g, '');
    const pin = this.generatePin();

    return {
      name,
      username,
      port,
      pin,
    };
  }

  /**
   * Create the default ui config
   */
  private async createDefaultUiConfig() {
    return {
      name: 'Config',
      port: this.action === 'install' ? this.uiPort : await this.getLastKnownUiPort(),
      platform: 'config',
    };
  }

  /**
   * Returns true if running on the Homebridge Rasbpian Image
   */
  private async isRaspbianImage(): Promise<boolean> {
    return os.platform() === 'linux' && await fs.pathExists('/etc/hb-ui-port');
  }

  /**
   * Check what the last known UI port was
   * Used when the ui config block is deleted and needs to be recreated
   */
  private async getLastKnownUiPort() {
    // check if we are running the raspbian image, the port will be stored in /etc/hb-ui-port
    if (await this.isRaspbianImage()) {
      const lastPort = parseInt((await fs.readFile('/etc/hb-ui-port', 'utf8')), 10);
      if (!isNaN(lastPort) && lastPort <= 65535) {
        return lastPort;
      }
    }

    // check if the port is defined in an env var (docker)
    const envPort = parseInt(process.env.HOMEBRIDGE_CONFIG_UI_PORT, 10);
    if (!isNaN(envPort) && envPort <= 65535) {
      return envPort;
    }

    // otherwise return the defaul port
    return this.uiPort;
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
   * Generate a random port for Homebridge
   */
  private async generatePort() {
    const randomPort = () => Math.floor(Math.random() * (52000 - 51000 + 1) + 51000);

    let port = randomPort();
    while (await tcpPortUsed.check(port)) {
      port = randomPort();
    }

    return port;
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

  /**
   * Checks to see if there are stale homebridge processes running on the same port
   */
  private async checkForStaleHomebridgeProcess() {
    if (os.platform() === 'win32') {
      return;
    }
    try {
      // load the config to get the homebridge port
      const currentConfig = await fs.readJson(process.env.UIX_CONFIG_PATH);
      if (!currentConfig.bridge || !currentConfig.bridge.port) {
        return;
      }

      // check if port is still in use
      if (!await tcpPortUsed.check(parseInt(currentConfig.bridge.port.toString(), 10))) {
        return;
      }

      // find the pid of the process using the port
      const pid = this.installer.getPidOfPort(parseInt(currentConfig.bridge.port.toString(), 10));
      if (!pid) {
        return;
      }

      // kill the stale Homebridge process
      this.logger(`Found stale Homebridge process running on port ${currentConfig.bridge.port} with PID ${pid}, killing...`);
      process.kill(pid, 'SIGKILL');
    } catch (e) {
      // do nothing
    }
  }

  /**
   * Tails the Homebridge service log and outputs the results to the console
   */
  private async tailLogs() {
    if (!fs.existsSync(this.logPath)) {
      this.logger(`ERROR: Log file does not exist at expected location: ${this.logPath}`, 'fail');
      process.exit(1);
    }

    const logStats = await fs.stat(this.logPath);
    const logStartPosition = logStats.size <= 200000 ? 0 : logStats.size - 200000;
    const logStream = fs.createReadStream(this.logPath, { start: logStartPosition });

    logStream.on('data', (buffer) => {
      process.stdout.write(buffer);
    });

    logStream.on('end', () => {
      logStream.close();
    });

    const tail = new Tail(this.logPath, {
      fromBeginning: false,
      useWatchFile: true,
      fsWatchOptions: {
        interval: 200,
      },
    });

    tail.on('line', console.log);
  }

  /**
   * Returns the path of the homebridge startup settings file
   */
  get homebridgeStartupOptionsPath() {
    return path.resolve(this.storagePath, '.uix-hb-service-homebridge-startup.json');
  }

  /**
   * Get the Homebridge startup options defined in the UI
   */
  private async loadHomebridgeStartupOptions() {
    try {
      if (await fs.pathExists(this.homebridgeStartupOptionsPath)) {
        const homebridgeStartupOptions = await fs.readJson(this.homebridgeStartupOptionsPath);

        // check if debug should be enabled
        if (homebridgeStartupOptions.debugMode && !this.homebridgeOpts.includes('-D')) {
          this.homebridgeOpts.push('-D');
        }

        // check if keep orphans should be enabled, only for Homebridge v1.0.2 and later
        if (this.homebridgePackage && semver.gte(this.homebridgePackage.version, '1.0.2', { includePrerelease: true })) {
          if (homebridgeStartupOptions.keepOrphans && !this.homebridgeOpts.includes('-K')) {
            this.homebridgeOpts.push('-K');
          }
        }

        // insecure mode is enabled by default, allow it to be removed if set to false
        if (homebridgeStartupOptions.insecureMode === false && this.homebridgeOpts.includes('-I')) {
          this.homebridgeOpts.splice(this.homebridgeOpts.findIndex((x) => x === '-I'), 1);
          process.env.UIX_INSECURE_MODE = '0';
        }

        // copy any custom env vars in
        Object.assign(this.homebridgeCustomEnv, homebridgeStartupOptions.env);
      } else if (this.docker) {
        // check old docker flag for debug mode
        if (process.env.HOMEBRIDGE_DEBUG === '1' && !this.homebridgeOpts.includes('-D')) {
          this.homebridgeOpts.push('-D');
        }

        // check old docker flag for insecure mode
        if (process.env.HOMEBRIDGE_INSECURE !== '1' && this.homebridgeOpts.includes('-I')) {
          this.homebridgeOpts.splice(this.homebridgeOpts.findIndex((x) => x === '-I'), 1);
          process.env.UIX_INSECURE_MODE = '0';
        }
      }
    } catch (e) {
      this.logger(`Failed to load startup options ${e.message}`);
    }
  }

  /**
   * Clears the Homebridge Cached Accessories
   */
  private clearHomebridgeCachedAccessories(callback) {
    if (this.homebridge && !this.homebridgeStopped) {
      this.homebridge.once('close', callback);
      this.restartHomebridge();
    } else {
      callback();
    }
  }

  /**
   * Standard SIGTERM restart for Homebridge
   */
  private restartHomebridge() {
    if (this.homebridge) {
      this.logger('Sending SIGTERM to Homebridge');
      this.homebridge.kill('SIGTERM');

      setTimeout(() => {
        if (!this.homebridgeStopped) {
          try {
            this.logger('Sending SIGKILL to Homebridge');
            this.homebridge.kill('SIGKILL');
          } catch (e) { }
        }
      }, 7000);
    }
  }

  /**
   * Send SIGKILL to Homebridge after a restore is completed to prevent the
   * Homebridge cached accessories being regenerated
   */
  private postBackupRestoreRestart() {
    if (this.homebridge) {
      this.logger('Sending SIGKILL to Homebridge');
      this.homebridge.kill('SIGKILL');
    }

    setTimeout(() => {
      process.kill(process.pid, 'SIGKILL');
    }, 500);
  }

  private getHomebridgeChildProcess(callback) {
    callback(this.homebridge);
  }

  /**
   * Fix the permission on the docker storage directory
   * This is only used when running in the oznu/docker-homebridge docker container
   */
  private fixDockerPermissions() {
    try {
      child_process.execSync(`chown -R ${this.uid}:${this.gid} "${this.storagePath}"`);
    } catch (e) {
      // do nothing
    }
  }

  /**
   * Check to see if Node.js version updates are available.
   * Prefer LTS versions
   * If current version is > LTS, update to the latest version while retaining the major version number
   */
  private async checkForNodejsUpdates(requestedVersion) {
    const versionList = (await axios.get('https://nodejs.org/dist/index.json')).data;
    const currentLts = versionList.filter(x => x.lts)[0];

    if (requestedVersion) {
      const wantedVersion = versionList.find(x => x.version.startsWith('v' + requestedVersion));
      if (wantedVersion) {
        this.logger(`Installing Node.js ${wantedVersion.version} over ${process.version}...`, 'info');
        return this.installer.updateNodejs({
          target: wantedVersion.version,
          rebuild: wantedVersion.modules !== process.versions.modules,
        });
      } else {
        this.logger(`v${requestedVersion} is not a valid Node.js version.`, 'info');
        return { update: false };
      }
    }

    if (semver.gt(currentLts.version, process.version)) {
      this.logger(`Updating Node.js from ${process.version} to ${currentLts.version}...`, 'info');
      return this.installer.updateNodejs({
        target: currentLts.version,
        rebuild: currentLts.modules !== process.versions.modules,
      });
    }

    const currentMajor = semver.parse(process.version).major;
    const latestVersion = versionList.filter(x => semver.parse(x.version).major === currentMajor)[0];

    if (semver.gt(latestVersion.version, process.version)) {
      this.logger(`Updating Node.js from ${process.version} to ${latestVersion.version}...`, 'info');
      return this.installer.updateNodejs({
        target: latestVersion.version,
        rebuild: latestVersion.modules !== process.versions.modules,
      });
    }

    this.logger(`Node.js ${process.version} already up-to-date.`);

    return { update: false };
  }

  /**
   * Download the Node.js binary to a temp file
   */
  public async downloadNodejs(downloadUrl: string): Promise<string> {
    const spinner = ora(`Downloading ${downloadUrl}`).start();

    try {
      const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'node'));
      const tempFilePath = path.join(tempDir, 'node.tar.gz');
      const tempFile = fs.createWriteStream(tempFilePath);

      await axios.get(downloadUrl, { responseType: 'stream' })
        .then((response) => {
          return new Promise((resolve, reject) => {
            response.data.pipe(tempFile)
              .on('finish', () => {
                return resolve(tempFile);
              })
              .on('error', (err) => {
                return reject(err);
              });
          });
        });

      spinner.succeed('Download complete.');
      return tempFilePath;
    } catch (e) {
      spinner.fail(e.message);
      process.exit(1);
    }
  }

  /**
   * Extract the Node.js tarball
   */
  public async extractNodejs(targetVersion: string, extractConfig) {
    const spinner = ora(`Installing Node.js ${targetVersion}`).start();

    try {
      await tar.x(extractConfig);
      spinner.succeed(`Installed Node.js ${targetVersion}`);
    } catch (e) {
      spinner.fail(e.message);
      process.exit(1);
    }
  }

  /**
   * Check the current status of the Homebridge UI by calling it's API
   */
  private async checkStatus() {
    this.logger(`Testing hb-service is running on port ${this.uiPort}...`);

    try {
      const res = await axios.get(`http://localhost:${this.uiPort}/api`);
      if (res.data === 'Hello World!') {
        this.logger('Homebridge UI Running', 'succeed');
      } else {
        this.logger('Unexpected Response', 'fail');
        process.exit(1);
      }
    } catch (e) {
      this.logger('Homebridge UI Not Running', 'fail');
      process.exit(1);
    }
  }

}

function bootstrap() {
  return new HomebridgeServiceHelper();
}

bootstrap();

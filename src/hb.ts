import * as path from 'path';
import * as fs from 'fs-extra';
import * as color from 'bash-color';
import * as commander from 'commander';

import { WSS } from './wss';

class HomebridgeUI {
  private logger;
  public ui: any;
  public homebridge: any;
  public configPath: string;
  public authPath: string;
  public storagePath: string;
  public pluginPath: string;
  public port: number | string;
  public logOpts: any;
  public restartCmd;
  public useSudo: boolean;
  public authMethod: string | boolean;
  public formAuth: boolean;
  public temperatureFile: string;
  public wss: WSS;

  constructor () {
    this.ui = fs.readJSONSync(path.resolve(__dirname, '../package.json'));
  }

  public init (log, config) {
    this.logger = log;

    this.configPath = this.homebridge.user.configPath();
    this.authPath = path.join(this.homebridge.user.storagePath(), 'auth.json');
    this.storagePath = this.homebridge.user.storagePath();

    this.parseCommandLineArgs();
    this.parseConfig(config);
  }

  private parseConfig (config) {
    this.port = config.port || 8080;
    this.logOpts = config.log;
    this.restartCmd = config.restart;
    this.useSudo = config.sudo;
    this.authMethod = config.auth;

    if (config.auth === 'none' || config.auth === false) {
      this.formAuth = false;
    } else if (config.auth === 'basic') {
      this.formAuth = false;
    } else {
      this.formAuth = true;
    }

    // check the path to the temp file actually exists
    if (config.temp && fs.existsSync(config.temp)) {
      this.temperatureFile = config.temp;
    } else if (config.temp) {
      // delay the output of the warning message so it does not get lost under homebridge setup details
      setTimeout(() => {
        this.log(color.yellow(`WARNING: Configured path to temp file does not exist: ${config.temp}`));
        this.log(color.yellow(`WARNING: CPU Temp will not be displayed`));
      }, 2000);
    }
  }

  private parseCommandLineArgs () {
    // parse plugin path argument from homebridge
    commander
      .allowUnknownOption()
      .option('-P, --plugin-path [path]', '', (p) => this.pluginPath = p)
      .parse(process.argv);
  }

  public log (msg: string) {
    this.logger(msg);
  }

  public async resetHomebridgeAccessory () {
    // load config file
    const config = await fs.readJson(this.configPath);

    // generate new random username and pin
    if (config.bridge) {
      config.bridge.pin = this.generatePin();
      config.bridge.username = this.generateUsername();

      // save config file
      await fs.writeJson(this.configPath, config, { spaces: 4 });

      this.log(`Homebridge Reset: New Username: ${config.bridge.username}`);
      this.log(`Homebridge Reset: New Pin: ${config.bridge.pin}`);
    } else {
      this.log(color.red('Homebridge Reset: Could not reset homebridge username or pin. Config format invalid.'));
    }

    // remove accessories and persist directories
    await fs.remove(path.resolve(this.storagePath, 'accessories'));
    await fs.remove(path.resolve(this.storagePath, 'persist'));

    this.log(`Homebridge Reset: "persist" directory removed.`);
    this.log(`Homebridge Reset: "accessories" directory removed.`);
  }

  private generatePin () {
    let code: string | Array<any> = Math.floor(10000000 + Math.random() * 90000000) + '';
    code = code.split('');
    code.splice(3, 0, '-');
    code.splice(6, 0, '-');
    code = code.join('');
    return code;
  }

  private generateUsername () {
    const hexDigits = '0123456789ABCDEF';
    let username = '0E:';
    for (let i = 0; i < 5; i++) {
      username += hexDigits.charAt(Math.round(Math.random() * 15));
      username += hexDigits.charAt(Math.round(Math.random() * 15));
      if (i !== 4) { username += ':'; }
    }
    return username;
  }
}

export const hb = new HomebridgeUI();

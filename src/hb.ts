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

  init (log, config) {
    this.logger = log;

    this.configPath = this.homebridge.user.configPath();
    this.authPath = path.join(this.homebridge.user.storagePath(), 'auth.json');
    this.storagePath = this.homebridge.user.storagePath();

    this.parseCommandLineArgs();
    this.parseConfig(config);
  }

  parseConfig (config) {
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

  parseCommandLineArgs () {
    // parse plugin path argument from homebridge
    commander
      .allowUnknownOption()
      .option('-P, --plugin-path [path]', '', (p) => this.pluginPath = p)
      .parse(process.argv);
  }

  log (msg: string) {
    this.logger(msg);
  }
}

export const hb = new HomebridgeUI();

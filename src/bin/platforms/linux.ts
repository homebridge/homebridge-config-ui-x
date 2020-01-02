import { HomebridgeServiceHelper } from '../hb-service';

export class LinuxInstaller {
  private hbService: HomebridgeServiceHelper;

  constructor(hbService: HomebridgeServiceHelper) {
    this.hbService = hbService;
  }

  public async install() {

  }

  public async uninstall() {

  }

  public async start() {

  }

  public async stop() {

  }

  public async restart() {

  }

  /**
   * Returns the users uid and gid.
   */
  public async getId(): Promise<{ uid: number, gid: number }> {
    return {
      uid: 0,
      gid: 0,
    };
  }

}
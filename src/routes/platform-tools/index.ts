import { Router } from 'express';

import { hb } from '../../hb';

import { DockerRouter } from './docker';
import { LinuxRouter } from './linux';

export class PlatformToolsRouter {
  public router: Router;

  constructor() {
    this.router = Router();

    // docker specific routes
    if (hb.runningInDocker) {
      this.router.use('/docker', new DockerRouter().router);
    }

    // linux specific routes
    if (hb.runningInLinux) {
      this.router.use('/linux', new LinuxRouter().router);
    }

  }
}

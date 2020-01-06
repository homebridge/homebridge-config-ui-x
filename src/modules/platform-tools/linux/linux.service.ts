import * as child_process from 'child_process';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '../../../core/config/config.service';

@Injectable()
export class LinuxService {
  constructor(
    private readonly configService: ConfigService,
    private readonly logger: Logger,
  ) { }

  /**
   * Reboot the host
   */
  restartHost() {
    const cmd = [(this.configService.ui.linux && this.configService.ui.linux.restart) ?
      this.configService.ui.linux.restart : 'sudo -n shutdown -r now'];

    this.logger.warn(`Rebooting linux server with command: "${cmd.join(' ')}"`);

    setTimeout(() => {
      child_process.exec(cmd.join(' '), (err) => {
        if (err) {
          this.logger.error(err.message);
        }
      });
    }, 100);

    return { ok: true, command: cmd };
  }

  /**
   * Shutdown the host
   */
  shutdownHost() {
    const cmd = [(this.configService.ui.linux && this.configService.ui.linux.shutdown) ?
      this.configService.ui.linux.shutdown : 'sudo -n shutdown -h now'];

    this.logger.warn(`Shutting down linux server with command: "${cmd.join(' ')}"`);

    setTimeout(() => {
      child_process.exec(cmd.join(' '), (err) => {
        if (err) {
          this.logger.error(err.message);
        }
      });
    }, 500);

    return { ok: true, command: cmd };
  }
}

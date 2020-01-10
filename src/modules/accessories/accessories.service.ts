import * as fs from 'fs-extra';
import { Injectable } from '@nestjs/common';
import { HapClient, ServiceType } from '@oznu/hap-client';
import { ConfigService } from '../../core/config/config.service';
import { Logger } from '../../core/logger/logger.service';

@Injectable()
export class AccessoriesService {
  private hapClient: HapClient;

  constructor(
    private readonly configService: ConfigService,
    private readonly logger: Logger,
  ) {
    if (this.configService.homebridgeInsecureMode) {
      this.hapClient = new HapClient({
        pin: this.configService.homebridgeConfig.bridge.pin,
        logger: this.logger,
        config: this.configService.ui.accessoryControl || {},
      });
    }
  }

  /**
   * Connects the client to the homebridge service
   * @param client
   */
  public async connect(client) {
    if (!this.configService.homebridgeInsecureMode) {
      this.logger.error('Homebridge must be running in insecure mode to control accessories');
      return;
    }

    let services;

    const loadAllAccessories = async () => {
      services = await this.loadAccessories();
      this.refreshCharacteristics(services);
      client.emit('accessories-data', services);
    };

    // initial load
    await loadAllAccessories();

    // handling incoming requests
    const requestHandler = async (msg?) => {
      if (msg.set) {
        const service: ServiceType = services.find(x => x.uniqueId === msg.set.uniqueId);
        if (service) {
          await service.setCharacteristic(msg.set.iid, msg.set.value);
          services = await this.loadAccessories();
          // do a refresh to check if any accessories changed after this action
          setTimeout(() => {
            this.refreshCharacteristics(services);
          }, 1500);
        }
      }
    };
    client.on('accessory-control', requestHandler);

    const monitor = await this.hapClient.monitorCharacteristics();

    const updateHandler = (data) => {
      client.emit('accessories-data', data);
    };
    monitor.on('service-update', updateHandler);

    const instanceUpdateHandler = async (data) => {
      client.emit('accessories-reload-required', services);
    };
    this.hapClient.on('instance-discovered', instanceUpdateHandler);

    // load a second time in case anything was missed
    const secondaryLoadTimeout = setTimeout(async () => {
      await loadAllAccessories();
    }, 3000);

    // clean up on disconnect
    const onEnd = () => {
      clearTimeout(secondaryLoadTimeout);
      client.removeAllListeners('end');
      client.removeAllListeners('disconnect');
      client.removeAllListeners('accessory-control');
      monitor.removeAllListeners('service-update');
      monitor.finish();
      this.hapClient.removeListener('instance-discovered', instanceUpdateHandler);
    };

    client.on('disconnect', onEnd.bind(this));
    client.on('end', onEnd.bind(this));

    // send a refresh instances request
    this.hapClient.refreshInstances();
  }

  /**
   * Refresh the characteristics from Homebridge
   * @param services
   */
  private refreshCharacteristics(services) {
    services.forEach(service => service.refreshCharacteristics());
  }

  /**
   * Load all the accessories from Homebridge
   * @param refreshServices
   */
  private async loadAccessories(refreshServices?: boolean) {
    return this.hapClient.getAllServices()
      .then(services => {
        return services;
      })
      .catch((e) => {
        if (e.statusCode === 401) {
          this.logger.warn(`Homebridge must be running in insecure mode to view and control accessories from this plugin.`);
        } else {
          this.logger.error(`Failed load accessories from Homebridge: ${e.message}`);
        }
        return [];
      });
  }

  /**
   * Get the accessory layout
   */
  public async getAccessoryLayout(username: string) {
    try {
      const accessoryLayout = await fs.readJson(this.configService.accessoryLayoutPath);
      if (username in accessoryLayout) {
        return accessoryLayout[username];
      } else {
        throw new Error('User not in Acccessory Layout');
      }
    } catch (e) {
      return [
        {
          name: 'Default Room',
          services: [],
        },
      ];
    }
  }

  /**
   * Saves the accessory layout
   * @param user
   * @param layout
   */
  public async saveAccessoryLayout(user: string, layout: object) {
    let accessoryLayout;

    try {
      accessoryLayout = await fs.readJson(this.configService.accessoryLayoutPath);
    } catch (e) {
      accessoryLayout = {};
    }

    accessoryLayout[user] = layout;
    fs.writeJsonSync(this.configService.accessoryLayoutPath, accessoryLayout);
    this.logger.log(`[${user}] Accessory layout changes saved.`);
    return layout;
  }
}

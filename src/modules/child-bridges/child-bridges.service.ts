import { BadRequestException, Injectable } from '@nestjs/common'

import { ConfigService } from '../../core/config/config.service'
import { HomebridgeIpcService } from '../../core/homebridge-ipc/homebridge-ipc.service'
import { Logger } from '../../core/logger/logger.service'
import { AccessoriesService } from '../accessories/accessories.service'

@Injectable()
export class ChildBridgesService {
  constructor(
    private readonly logger: Logger,
    private readonly configService: ConfigService,
    private readonly homebridgeIpcService: HomebridgeIpcService,
    private readonly accessoriesService: AccessoriesService,
  ) {}

  /**
   * Return an array of child bridges
   */
  public async getChildBridges() {
    if (!this.configService.serviceMode) {
      throw new BadRequestException('This command is only available in service mode')
    }

    try {
      return await this.homebridgeIpcService.requestResponse('childBridgeMetadataRequest', 'childBridgeMetadataResponse')
    } catch (e) {
      return []
    }
  }

  /**
   * Socket Handler - Per Client
   * Start watching for child bridge status events
   * @param client
   */
  public async watchChildBridgeStatus(client) {
    const listener = (data) => {
      client.emit('child-bridge-status-update', data)
    }

    this.homebridgeIpcService.setMaxListeners(this.homebridgeIpcService.getMaxListeners() + 1)
    this.homebridgeIpcService.on('childBridgeStatusUpdate', listener)

    // cleanup on disconnect
    const onEnd = () => {
      client.removeAllListeners('end')
      client.removeAllListeners('disconnect')
      client.setMaxListeners(client.getMaxListeners() - 2)
      this.homebridgeIpcService.removeListener('childBridgeStatusUpdate', listener)
      this.homebridgeIpcService.setMaxListeners(this.homebridgeIpcService.getMaxListeners() - 1)
    }

    client.setMaxListeners(client.getMaxListeners() + 2)
    client.on('end', onEnd.bind(this))
    client.on('disconnect', onEnd.bind(this))
  }

  /**
   * Start / stop / restart a child bridge
   * @param event
   * @param deviceId
   * @returns ok when done
   */
  public stopStartRestartChildBridge(event: 'startChildBridge' | 'stopChildBridge' | 'restartChildBridge', deviceId: string) {
    if (!this.configService.serviceMode) {
      this.logger.error('The restart child bridge command is only available in service mode')
      throw new BadRequestException('This command is only available in service mode')
    }

    if (deviceId.length === 12) {
      deviceId = deviceId.match(/.{1,2}/g).join(':')
    }

    this.homebridgeIpcService.sendMessage(event, deviceId)

    setTimeout(() => {
      this.accessoriesService.resetInstancePool()
    }, 5000)

    return {
      ok: true,
    }
  }

  /**
   * Restart a single child bridge
   */
  public restartChildBridge(deviceId: string) {
    return this.stopStartRestartChildBridge('restartChildBridge', deviceId)
  }

  /**
   * Restart a single child bridge
   */
  public stopChildBridge(deviceId: string) {
    return this.stopStartRestartChildBridge('stopChildBridge', deviceId)
  }

  /**
   * Restart a single child bridge
   */
  public startChildBridge(deviceId: string) {
    return this.stopStartRestartChildBridge('restartChildBridge', deviceId)
  }
}

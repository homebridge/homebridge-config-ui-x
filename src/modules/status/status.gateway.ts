import { UseGuards } from '@nestjs/common'
import { SubscribeMessage, WebSocketGateway, WsException } from '@nestjs/websockets'

import { WsGuard } from '../../core/auth/guards/ws.guard'
import { ChildBridgesService } from '../child-bridges/child-bridges.service'
import { PluginsService } from '../plugins/plugins.service'
import { StatusService } from './status.service'

@UseGuards(WsGuard)
@WebSocketGateway({
  namespace: 'status',
  allowEIO3: true,
  cors: {
    origin: ['http://localhost:8080', 'http://localhost:4200'],
    credentials: true,
  },
})
export class StatusGateway {
  constructor(
    private statusService: StatusService,
    private pluginsService: PluginsService,
    private childBridgesService: ChildBridgesService,
  ) {}

  @SubscribeMessage('get-dashboard-layout')
  async getDashboardLayout() {
    try {
      return await this.statusService.getDashboardLayout()
    } catch (e) {
      return new WsException(e.message)
    }
  }

  @SubscribeMessage('set-dashboard-layout')
  async setDashboardLayout(client, payload) {
    try {
      return await this.statusService.setDashboardLayout(payload)
    } catch (e) {
      return new WsException(e.message)
    }
  }

  @SubscribeMessage('homebridge-version-check')
  async homebridgeVersionCheck() {
    try {
      return await this.pluginsService.getHomebridgePackage()
    } catch (e) {
      return new WsException(e.message)
    }
  }

  @SubscribeMessage('homebridge-ui-version-check')
  async homebridgeUiVersionCheck() {
    try {
      return await this.pluginsService.getHomebridgeUiPackage()
    } catch (e) {
      return new WsException(e.message)
    }
  }

  @SubscribeMessage('npm-version-check')
  async npmVersionCheck() {
    try {
      return await this.pluginsService.getNpmPackage()
    } catch (e) {
      return new WsException(e.message)
    }
  }

  @SubscribeMessage('nodejs-version-check')
  async nodeJsVersionCheck() {
    try {
      return await this.statusService.getNodeJsVersionInfo()
    } catch (e) {
      return new WsException(e.message)
    }
  }

  @SubscribeMessage('get-out-of-date-plugins')
  async getOutOfDatePlugins() {
    try {
      return await this.pluginsService.getOutOfDatePlugins()
    } catch (e) {
      return new WsException(e.message)
    }
  }

  @SubscribeMessage('get-homebridge-server-info')
  async getHomebridgeServerInfo() {
    try {
      return await this.statusService.getHomebridgeServerInfo()
    } catch (e) {
      return new WsException(e.message)
    }
  }

  @SubscribeMessage('get-server-cpu-info')
  async getServerCpuInfo() {
    try {
      return await this.statusService.getServerCpuInfo()
    } catch (e) {
      return new WsException(e.message)
    }
  }

  @SubscribeMessage('get-server-memory-info')
  async getServerMemoryInfo() {
    try {
      return await this.statusService.getServerMemoryInfo()
    } catch (e) {
      return new WsException(e.message)
    }
  }

  @SubscribeMessage('get-server-network-info')
  async getServerNetworkInfo(client, payload?: { netInterfaces: string[] }) {
    try {
      return await this.statusService.getCurrentNetworkUsage(payload.netInterfaces || [])
    } catch (e) {
      return new WsException(e.message)
    }
  }

  @SubscribeMessage('get-server-uptime-info')
  async getServerUptimeInfo() {
    try {
      return await this.statusService.getServerUptimeInfo()
    } catch (e) {
      return new WsException(e.message)
    }
  }

  @SubscribeMessage('get-homebridge-pairing-pin')
  async getHomebridgePairingPin() {
    try {
      return await this.statusService.getHomebridgePairingPin()
    } catch (e) {
      return new WsException(e.message)
    }
  }

  @SubscribeMessage('get-homebridge-status')
  async getHomebridgeStatus() {
    try {
      return await this.statusService.getHomebridgeStatus()
    } catch (e) {
      return new WsException(e.message)
    }
  }

  @SubscribeMessage('monitor-server-status')
  async serverStatus(client) {
    this.statusService.watchStats(client)
  }

  /**
   * @deprecated
   */
  @SubscribeMessage('get-homebridge-child-bridge-status')
  async getChildBridges() {
    try {
      return await this.childBridgesService.getChildBridges()
    } catch (e) {
      return new WsException(e.message)
    }
  }

  /**
   * @deprecated
   */
  @SubscribeMessage('monitor-child-bridge-status')
  async watchChildBridgeStatus(client) {
    this.childBridgesService.watchChildBridgeStatus(client)
  }

  @SubscribeMessage('get-raspberry-pi-throttled-status')
  async getRaspberryPiThrottledStatus() {
    try {
      return await this.statusService.getRaspberryPiThrottledStatus()
    } catch (e) {
      return new WsException(e.message)
    }
  }
}

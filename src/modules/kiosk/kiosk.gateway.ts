import type { Socket } from 'socket.io'

import { EventEmitter } from 'node:events'

import { Inject } from '@nestjs/common'
import { SubscribeMessage, WebSocketGateway } from '@nestjs/websockets'

import { devServerCorsConfig } from '../../core/cors.config.js'
import { AccessoriesService } from '../accessories/accessories.service.js'
import { KioskService, SENSITIVE_HAP_TYPES } from './kiosk.service.js'

function isSensitive(service: any): boolean {
  return SENSITIVE_HAP_TYPES.has(service?.type) || /doorlock/i.test(String(service?.deviceType ?? ''))
}

/**
 * Stands in for the socket when handing it to AccessoriesService.connect(): everything the service sends is
 * filtered to the device's allowed accessories, and `accessory-control` reaches the service only after the gateway
 * has authorised it. Events the service emits that are not listed here are dropped.
 */
class KioskClientFacade extends EventEmitter {
  /** uniqueId -> sensitive, learned from the (already allowed) data sent to this device */
  readonly sensitivity = new Map<string, boolean>()

  constructor(
    private readonly socket: Socket,
    private readonly deviceId: string,
    private readonly kioskService: KioskService,
  ) {
    super()
  }

  /** Deliver an event from the real socket to the listeners AccessoriesService registered */
  dispatch(event: string, ...args: unknown[]) {
    return super.emit(event, ...args)
  }

  override emit(event: string, ...args: any[]): boolean {
    switch (event) {
      case 'accessories-data':
      case 'accessories-reload-required': {
        const device = this.kioskService.peekDevice(this.deviceId)
        const list = Array.isArray(args[0])
          ? args[0]
          : []
        const allowed = new Set(device?.allowedUniqueIds ?? [])
        const filtered = list.filter(s => typeof s?.uniqueId === 'string' && allowed.has(s.uniqueId))
        for (const s of filtered) {
          this.sensitivity.set(s.uniqueId, isSensitive(s))
        }
        // `accessories-reload-required` is sent even when empty; an empty data event carries nothing
        if (filtered.length || event === 'accessories-reload-required') {
          this.socket.emit(event, filtered)
        }
        return true
      }
      case 'accessory-control-failure':
      case 'hap-accessories-ready-for-control':
      case 'matter-accessories-ready-for-control':
      case 'matter-accessories-reload-required':
        this.socket.emit(event, ...args)
        return true
      default:
        return false
    }
  }
}

@WebSocketGateway({
  namespace: 'kiosk',
  allowEIO3: true,
  cors: devServerCorsConfig,
})
export class KioskGateway {
  private readonly facades = new WeakMap<Socket, KioskClientFacade>()

  constructor(
    @Inject(KioskService) private readonly kioskService: KioskService,
    @Inject(AccessoriesService) private readonly accessoriesService: AccessoriesService,
  ) {}

  async handleConnection(client: Socket) {
    try {
      const token = (client.handshake as any)?.auth?.kioskToken
      const device = typeof token === 'string'
        ? await this.kioskService.authenticateToken(token)
        : null
      if (!device) {
        client.disconnect(true)
        return
      }
      client.data = { kioskDeviceId: device.id, kioskTokenHash: device.tokenHash }
      this.kioskService.registerSocket(device.id, client)
      this.kioskService.touch(device.id, client.handshake?.address)
    } catch {
      client.disconnect(true)
    }
  }

  handleDisconnect(client: Socket) {
    const deviceId = client.data?.kioskDeviceId
    if (deviceId) {
      this.kioskService.unregisterSocket(deviceId, client)
    }
    this.facades.get(client)?.dispatch('disconnect')
  }

  /** The stored device, if this socket's token is still the current one. Otherwise the socket is cut off. */
  private async currentDevice(client: Socket) {
    const deviceId = client.data?.kioskDeviceId
    const device = deviceId
      ? await this.kioskService.getDevice(deviceId)
      : undefined
    if (!device || !device.tokenHash || device.tokenHash !== client.data?.kioskTokenHash) {
      client.disconnect(true)
      return undefined
    }
    return device
  }

  @SubscribeMessage('get-accessories')
  async connect(client: Socket) {
    const device = await this.currentDevice(client)
    if (!device) {
      return
    }
    let facade = this.facades.get(client)
    if (!facade) {
      facade = new KioskClientFacade(client, device.id, this.kioskService)
      this.facades.set(client, facade)
    }
    // Not awaited, as in the accessories gateway; a rejection must not go unhandled
    this.accessoriesService.connect(facade as unknown as Socket).catch((e) => {
      client.emit('accessory-control-failure', e.message)
    })
  }

  @SubscribeMessage('accessory-control')
  async control(client: Socket, msg?: any) {
    const device = await this.currentDevice(client)
    const facade = this.facades.get(client)
    if (!device || !facade || !msg || typeof msg !== 'object') {
      return
    }
    if (msg.set !== undefined) {
      const uniqueId = msg.set?.uniqueId
      if (typeof uniqueId !== 'string' || !device.allowedUniqueIds.includes(uniqueId)) {
        client.emit('accessory-control-failure', 'This accessory is not available on this device')
        return
      }
      // Unknown means not seen yet in this session's data, so treated as sensitive
      if (!device.allowSensitive && facade.sensitivity.get(uniqueId) !== false) {
        client.emit('accessory-control-failure', 'This accessory cannot be controlled from this device')
        return
      }
    }
    facade.dispatch('accessory-control', msg)
  }
}

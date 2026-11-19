import type { CanActivate, ExecutionContext } from '@nestjs/common'

import { Inject, Injectable, UnauthorizedException } from '@nestjs/common'

import { KioskService, parseKioskAuthorization } from './kiosk.service.js'

/**
 * Accepts ONLY `Authorization: Kiosk <token>` and attaches the device as `request.kioskDevice`.
 * It deliberately does not set `request.user`, so a device can never satisfy a JWT or admin check.
 */
@Injectable()
export class KioskDeviceGuard implements CanActivate {
  constructor(
    @Inject(KioskService) private readonly kioskService: KioskService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest()
    const token = parseKioskAuthorization(request.headers?.authorization)
    const device = token
      ? await this.kioskService.authenticateToken(token)
      : null
    if (!device) {
      throw new UnauthorizedException()
    }
    this.kioskService.touch(device.id, request.ip)
    request.kioskDevice = device
    return true
  }
}

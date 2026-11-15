import type { CanActivate, ExecutionContext } from '@nestjs/common'

import { Injectable } from '@nestjs/common'

@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest()
    return request.user.admin
  }
}

import { ExecutionContext, Injectable } from '@nestjs/common'
import { AuthGuard } from '@nestjs/passport'

import { AuthService } from '../auth.service'

@Injectable()
export class JwtOrApiTokenGuard extends AuthGuard('jwt') {
  constructor(private readonly authService: AuthService) {
    super()
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest()
    const authHeader = request.headers.authorization

    if (authHeader) {
      // Case-insensitive check for Bearer token
      const lowerAuthHeader = authHeader.toLowerCase()
      if (lowerAuthHeader.startsWith('bearer ')) {
        const token = authHeader.substring(7)

        // Check if this looks like an API token (64 char hex string)
        if (token.length === 64 && /^[0-9a-f]{64}$/.test(token)) {
          // Try to validate as API token
          const user = await this.authService.validateApiToken(token)
          if (user) {
            request.user = user
            return true
          }
        }
      }
    }

    // Fall back to JWT validation
    return super.canActivate(context) as Promise<boolean>
  }
}

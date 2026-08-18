import { Inject, Injectable, Optional } from '@nestjs/common'
import { AuthGuard, AuthModuleOptions } from '@nestjs/passport'

@Injectable()
export class CustomGuard extends AuthGuard('jwt') {
  // Nest 12 reads @Optional() constructor markers with getOwnMetadata, so
  // the optional flag on the mixin's options param no longer inherits.
  // Redeclare the same optional dependency here and pass it through.
  constructor(@Optional() @Inject(AuthModuleOptions) options?: AuthModuleOptions) {
    super(options)
  }

  handleRequest(err: any, user: any) {
    if (err || !user) {
      return null
    }
    return user
  }
}

import { Controller, Get, Inject, Post, UseGuards } from '@nestjs/common'
import { AuthGuard } from '@nestjs/passport'

import { AdminGuard } from '../../../core/auth/guards/admin.guard.js'
import { TerminalService } from './terminal.service.js'

// The terminal is admin-only: the websocket gateway that opens a session is
// gated with WsAdminGuard. These HTTP endpoints inspect and destroy the shared
// persistent session, so they need the same restriction — otherwise a non-admin
// could see whether an admin has a terminal open and kill it. AuthGuard runs
// first (populating request.user) and AdminGuard then checks the admin flag.
@UseGuards(AuthGuard(), AdminGuard)
@Controller('platform-tools/terminal')
export class TerminalController {
  constructor(
    @Inject(TerminalService) private readonly terminalService: TerminalService,
  ) {}

  @Get('has-persistent-session')
  hasPersistentSession() {
    return { hasPersistentSession: this.terminalService.hasPersistentSession() }
  }

  @Post('destroy-persistent-session')
  destroyPersistentSession() {
    this.terminalService.destroyPersistentSession()
    return { success: true }
  }
}

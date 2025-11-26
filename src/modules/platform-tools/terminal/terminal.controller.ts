import { Controller, Get, Inject, Post, UseGuards } from '@nestjs/common'
import { AuthGuard } from '@nestjs/passport'

import { TerminalService } from './terminal.service.js'

@UseGuards(AuthGuard())
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

import { Body, Controller, Get, Inject, Post, UseGuards } from '@nestjs/common'
import { AuthGuard } from '@nestjs/passport'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'

import { AdminGuard } from '../../core/auth/guards/admin.guard.js'
import { UpdateAllJournalService } from './update-all-journal.service.js'
import { UpdateAllStartDto } from './update-all.dto.js'
import { UpdateAllService } from './update-all.service.js'

@ApiTags('Update All')
@ApiBearerAuth()
@UseGuards(AuthGuard(), AdminGuard)
@Controller('update-all')
export class UpdateAllController {
  constructor(
    @Inject(UpdateAllJournalService) private readonly journalService: UpdateAllJournalService,
    @Inject(UpdateAllService) private readonly updateAllService: UpdateAllService,
  ) {}

  @ApiOperation({ summary: 'Compute what an Update All run would do right now, with a reason for everything excluded. A pure read - nothing is installed or restarted.' })
  @Get('plan')
  async getPlan() {
    return await this.updateAllService.computePlan()
  }

  @ApiOperation({ summary: 'Start an Update All run for the confirmed items. Returns the run id; progress is written to the journal as the serial update loop runs.' })
  @Post('start')
  async startRun(@Body() body: UpdateAllStartDto) {
    return await this.updateAllService.start(body.items)
  }

  @ApiOperation({ summary: 'Cancel the active Update All run. Takes effect between items - the item currently updating always finishes.' })
  @Post('cancel')
  async cancelRun() {
    return this.updateAllService.cancel()
  }

  @ApiOperation({ summary: 'Return the journal of the most recent Update All run, or null if there has never been one.' })
  @Get('journal')
  async getJournal() {
    return await this.journalService.read()
  }
}

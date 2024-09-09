import {
  Controller,
  Get,
  InternalServerErrorException,
  Param,
  Post,
  Put,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common'
import { AuthGuard } from '@nestjs/passport'

import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger'
import type { StreamableFile } from '@nestjs/common'
import type { FastifyRequest } from 'fastify'

import { AdminGuard } from '../../core/auth/guards/admin.guard'
import { Logger } from '../../core/logger/logger.service'
import { BackupService } from './backup.service'

@ApiTags('Backup & Restore')
@ApiBearerAuth()
@UseGuards(AuthGuard())
@Controller('backup')
export class BackupController {
  constructor(
    private backupService: BackupService,
    private logger: Logger,
  ) {}

  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'Download a .tar.gz of the Homebridge instance.' })
  @Get('/download')
  async downloadBackup(@Res({ passthrough: true }) res): Promise<StreamableFile> {
    try {
      return await this.backupService.downloadBackup(res)
    } catch (e) {
      console.error(e)
      this.logger.error(`Backup Failed ${e}`)
      throw new InternalServerErrorException(e.message)
    }
  }

  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'Return the date and time of the next scheduled backup.' })
  @Get('/scheduled-backups/next')
  async getNextBackupTime() {
    return this.backupService.getNextBackupTime()
  }

  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'List available system generated instance backups.' })
  @Get('/scheduled-backups')
  async listScheduledBackups() {
    return this.backupService.listScheduledBackups()
  }

  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'Download a system generated instance backup.' })
  @ApiParam({ name: 'backupId', type: 'string' })
  @Get('/scheduled-backups/:backupId')
  async getScheduledBackup(@Param('backupId') backupId): Promise<StreamableFile> {
    return this.backupService.getScheduledBackup(backupId)
  }

  @UseGuards(AdminGuard)
  @Post('/restore')
  @ApiOperation({
    summary: 'Upload a .tar.gz of the Homebridge instance.',
    description: 'NOTE: This endpoint does not trigger the restore process.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
        },
      },
    },
  })
  async restoreBackup(@Req() req: FastifyRequest) {
    try {
      const data = await req.file()
      if (data.file.truncated) {
        throw new InternalServerErrorException(`Restore file exceeds maximum size ${globalThis.backup.maxBackupSizeText}`)
      } else {
        await this.backupService.uploadBackupRestore(data)
      }
    } catch (err) {
      this.logger.error('Restore backup failed:', err.message)
      throw new InternalServerErrorException(err.message)
    }
  }

  @UseGuards(AdminGuard)
  @Put('/restore/trigger')
  @ApiOperation({
    summary: 'Triggers a headless restore process from the last uploaded backup file.',
    description: 'Logs to stdout / stderr.',
  })
  async restoreBackupTrigger() {
    return await this.backupService.triggerHeadlessRestore()
  }

  @UseGuards(AdminGuard)
  @ApiOperation({
    summary: 'Upload a .hbfx backup file created by third party apps.',
    description: 'NOTE: This endpoint does not trigger the restore process.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
        },
      },
    },
  })
  @Post('/restore/hbfx')
  async restoreHbfx(@Req() req: FastifyRequest) {
    try {
      const data = await req.file()
      await this.backupService.uploadHbfxRestore(data)
    } catch (err) {
      this.logger.error('Restore backup failed:', err.message)
      throw new InternalServerErrorException(err.message)
    }
  }

  @UseGuards(AdminGuard)
  @Put('/restart')
  @ApiOperation({ summary: 'Trigger a hard restart of Homebridge (use after restoring backup).' })
  postBackupRestoreRestart() {
    return this.backupService.postBackupRestoreRestart()
  }
}

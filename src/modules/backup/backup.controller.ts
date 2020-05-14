import { Controller, Get, Post, Put, UseGuards, Res, Req, InternalServerErrorException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { BackupService } from './backup.service';
import { AdminGuard } from '../../core/auth/guards/admin.guard';
import { Logger } from '../../core/logger/logger.service';

@UseGuards(AuthGuard())
@Controller('backup')
export class BackupController {

  constructor(
    private backupService: BackupService,
    private logger: Logger,
  ) { }

  @UseGuards(AdminGuard)
  @Get('/download')
  async downloadBackup(@Res() reply) {
    try {
      return await this.backupService.downloadBackup(reply);
    } catch (e) {
      console.error(e);
      this.logger.error('Backup Failed ' + e);
      throw new InternalServerErrorException(e.message);
    }
  }

  @UseGuards(AdminGuard)
  @Post('/restore')
  restoreBackup(@Req() req, @Res() res) {
    req.multipart(async (field, file, filename, encoding, mimetype) => {
      this.backupService.uploadBackupRestore(file);
    }, (err) => {
      if (err) {
        return res.send(500).send(err.message);
      }
      return res.code(200).send();
    });
  }

  @UseGuards(AdminGuard)
  @Post('/restore/hbfx')
  restoreHbfx(@Req() req, @Res() res) {
    req.multipart(async (field, file, filename, encoding, mimetype) => {
      this.backupService.uploadHbfxRestore(file);
    }, (err) => {
      if (err) {
        return res.send(500).send(err.message);
      }
      return res.code(200).send();
    });
  }

  @UseGuards(AdminGuard)
  @Put('/restart')
  postBackupRestoreRestart() {
    return this.backupService.postBackupRestoreRestart();
  }

}

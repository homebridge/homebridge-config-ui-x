import { Controller, Get, Post, Put, UseGuards, Res, Req } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { BackupService } from './backup.service';
import { AdminGuard } from '../../core/auth/guards/admin.guard';

@UseGuards(AuthGuard())
@Controller('backup')
export class BackupController {

  constructor(
    private backupService: BackupService,
  ) { }

  @UseGuards(AdminGuard)
  @Get('/download')
  downloadBackup(@Res() reply) {
    return this.backupService.downloadBackup(reply);
  }

  @UseGuards(AdminGuard)
  @Post('/restore')
  restoreBackkup(@Req() req, @Res() res) {
    req.multipart(async (field, file, filename, encoding, mimetype) => {
      if (mimetype !== 'application/x-gzip') {
        return res.code(400).send('Invalid File Type');
      }
      this.backupService.uploadBackupRestore(file);
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

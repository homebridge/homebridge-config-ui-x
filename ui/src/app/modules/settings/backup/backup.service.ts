import { inject, Injectable } from '@angular/core'
import { TranslateService } from '@ngx-translate/core'
import { saveAs } from 'file-saver'
import { ToastrService } from 'ngx-toastr'
import { firstValueFrom } from 'rxjs'

import { ApiService } from '@/app/core/api.service'

@Injectable({
  providedIn: 'root',
})
export class BackupService {
  private $api = inject(ApiService)
  private $toastr = inject(ToastrService)
  private $translate = inject(TranslateService)

  public async downloadBackup(): Promise<void> {
    const res = await firstValueFrom(this.$api.get('/backup/download', {
      observe: 'response',
      responseType: 'blob',
    }))
    const archiveName = res.headers.get('File-Name') || 'homebridge-backup.tar.gz'
    const sizeInBytes = res.body.size
    if (sizeInBytes > globalThis.backup.maxBackupSize) {
      const message = this.$translate.instant('backup.backup_exceeds_max_size', {
        maxBackupSizeText: globalThis.backup.maxBackupSizeText,
        size: `${(sizeInBytes / (1024 * 1024)).toFixed(1)}MB`,
      })
      this.$toastr.warning(message, this.$translate.instant('toast.title_warning'))
    }
    saveAs(res.body, archiveName)
  }
}

import { inject, Injectable } from '@angular/core'
import { TranslateService } from '@ngx-translate/core'
import { ToastrService } from 'ngx-toastr'

import { ApiService } from '@/app/core/communication/api.service'
import { SAVE_AS } from '@/app/core/utilities/file-saver.factory'

@Injectable({
  providedIn: 'root',
})
export class BackupService {
  private $saveAs = inject(SAVE_AS)
  private $api = inject(ApiService)
  private $toastr = inject(ToastrService)
  private $translate = inject(TranslateService)

  public async downloadBackup(): Promise<void> {
    const res = await this.$api.get('/backup/download', {
      observe: 'response',
      responseType: 'blob',
    })
    const archiveName = res.headers.get('File-Name') || 'homebridge-backup.tar.gz'
    const sizeInBytes = res.body!.size
    if (sizeInBytes > globalThis.backup.maxBackupSize) {
      const message = this.$translate.instant('backup.backup_exceeds_max_size', {
        maxBackupSizeText: globalThis.backup.maxBackupSizeText,
        size: `${(sizeInBytes / (1024 * 1024)).toFixed(1)}MB`,
      })
      this.$toastr.warning(message, this.$translate.instant('toast.title_warning'))
    }
    this.$saveAs(res.body!, archiveName)
  }
}

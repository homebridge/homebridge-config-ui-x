import { DatePipe } from '@angular/common'
import { ChangeDetectionStrategy, Component, inject, OnInit, signal } from '@angular/core'
import { ReactiveFormsModule } from '@angular/forms'
import { Router } from '@angular/router'
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap/modal'
import { NgbTooltip } from '@ng-bootstrap/ng-bootstrap/tooltip'
import { TranslatePipe, TranslateService } from '@ngx-translate/core'
import { ToastrService } from 'ngx-toastr'

import { ApiService } from '@/app/core/communication/api.service'
import { CONFIG_RESTORE_MODAL_DATA } from '@/app/core/modal-data-tokens'
import { SAVE_AS } from '@/app/core/utilities/file-saver.factory'
import { HttpErrorService } from '@/app/core/utilities/http-error.service'
import { ConfigRestoreBackup } from '@/app/modules/config-editor/config-editor.interfaces'

@Component({
  selector: 'app-config-restore',
  imports: [
    DatePipe,
    TranslatePipe,
    NgbTooltip,
    ReactiveFormsModule,
  ],
  standalone: true,
  templateUrl: './config-restore.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConfigRestoreComponent implements OnInit {
  // Injected dependencies
  private $saveAs = inject(SAVE_AS)
  private $activeModal = inject(NgbActiveModal)
  private $api = inject(ApiService)
  private $errors = inject(HttpErrorService)
  private $router = inject(Router)
  private $toastr = inject(ToastrService)
  private $translate = inject(TranslateService)
  private modalData = inject(CONFIG_RESTORE_MODAL_DATA)

  // Public properties (from injected data)
  public currentConfig = this.modalData.currentConfig
  public fromSettings = this.modalData.fromSettings ?? false

  // Other signals
  public readonly loading = signal(true)
  public readonly backupList = signal<ConfigRestoreBackup[]>([])
  public readonly clicked = signal(false)
  public readonly deleting = signal<string | null>(null)

  public ngOnInit(): void {
    void this.getConfigBackups()
  }

  public async getConfigBackups(): Promise<void> {
    try {
      const data = await this.$api.get('/config-editor/backups')
      this.loading.set(false)
      this.backupList.set(data)
    } catch (error: any) {
      this.loading.set(false)
      console.error(error)
      this.$toastr.error(this.$errors.toToastMessage(error), this.$translate.instant('toast.title_error'))
      this.dismissModal()
    }
  }

  public restore(backupId: string) {
    return this.$activeModal.close(backupId)
  }

  public async download(backupId: string): Promise<void> {
    this.clicked.set(true)
    try {
      const json = await this.$api.get(`/config-editor/backups/${backupId}`)
      const formattedJson = JSON.stringify(json, null, 4)
      const blob = new Blob([formattedJson], { type: 'application/json' })
      const fileName = `config-backup-${backupId}.json`
      this.$saveAs(blob, fileName)
      this.clicked.set(false)
    } catch (error: any) {
      this.clicked.set(false)
      this.$toastr.error(this.$errors.toToastMessage(error), this.$translate.instant('toast.title_error'))
      console.error(error)
    }
  }

  public downloadCurrentConfig(): void {
    const dataStr = `data:text/json;charset=utf-8,${encodeURIComponent(this.currentConfig)}`
    const downloadAnchorNode = document.createElement('a')
    downloadAnchorNode.setAttribute('href', dataStr)
    downloadAnchorNode.setAttribute('download', 'config.json')
    document.body.appendChild(downloadAnchorNode) // required for firefox
    downloadAnchorNode.click()
    downloadAnchorNode.remove()
  }

  public async delete(backupId: string): Promise<void> {
    this.deleting.set(backupId)
    try {
      await this.$api.delete(`/config-editor/backups/${backupId}`)
      await this.getConfigBackups()
      this.deleting.set(null)
    } catch (error: any) {
      this.deleting.set(null)
      this.$toastr.error(this.$errors.toToastMessage(error), this.$translate.instant('toast.title_error'))
      console.error(error)
    }
  }

  public async deleteAllBackups(): Promise<void> {
    this.deleting.set('all')
    try {
      await this.$api.delete('/config-editor/backups')
      this.$toastr.success(this.$translate.instant('config.restore.toast_backups_deleted'), this.$translate.instant('toast.title_success'))
      this.backupList.set([])
      this.deleting.set(null)
    } catch (error: any) {
      this.$toastr.error(this.$errors.toToastMessage(error), this.$translate.instant('toast.title_error'))
      console.error(error)
      this.deleting.set(null)
    }
  }

  public dismissModal(): void {
    if (this.fromSettings) {
      void this.$router.navigate(['/settings'])
    }
    this.$activeModal.dismiss('Dismiss')
  }
}

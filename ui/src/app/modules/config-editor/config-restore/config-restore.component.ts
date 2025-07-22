import { DatePipe, NgClass } from '@angular/common'
import { Component, inject, Input, OnInit } from '@angular/core'
import { ReactiveFormsModule } from '@angular/forms'
import { Router } from '@angular/router'
import { NgbActiveModal, NgbTooltip } from '@ng-bootstrap/ng-bootstrap'
import { TranslatePipe, TranslateService } from '@ngx-translate/core'
import { saveAs } from 'file-saver'
import { ToastrService } from 'ngx-toastr'
import { firstValueFrom } from 'rxjs'

import { ApiService } from '@/app/core/api.service'
import { ConfigRestoreBackup } from '@/app/modules/config-editor/config-editor.interfaces'

@Component({
  templateUrl: './config-restore.component.html',
  standalone: true,
  imports: [
    DatePipe,
    TranslatePipe,
    NgbTooltip,
    NgClass,
    ReactiveFormsModule,
  ],
})
export class ConfigRestoreComponent implements OnInit {
  private $activeModal = inject(NgbActiveModal)
  private $api = inject(ApiService)
  private $router = inject(Router)
  private $toastr = inject(ToastrService)
  private $translate = inject(TranslateService)

  @Input() currentConfig: string
  @Input() fromSettings = false

  public loading = true
  public backupList: ConfigRestoreBackup[] = []
  public clicked = false
  public deleting: string | null = null

  public ngOnInit() {
    this.getConfigBackups()
  }

  public async getConfigBackups() {
    try {
      const data = await firstValueFrom(this.$api.get('/config-editor/backups'))
      this.loading = false
      this.backupList = data
    } catch (error) {
      this.loading = false
      console.error(error)
      this.$toastr.error(error.error?.message || error.message, this.$translate.instant('toast.title_error'))
      this.dismissModal()
    }
  }

  public restore(backupId: string) {
    return this.$activeModal.close(backupId)
  }

  public async download(backupId: string) {
    this.clicked = true
    try {
      const json = await firstValueFrom(this.$api.get(`/config-editor/backups/${backupId}`))
      const formattedJson = JSON.stringify(json, null, 4)
      const blob = new Blob([formattedJson], { type: 'application/json' })
      const fileName = `config-backup-${backupId}.json`
      saveAs(blob, fileName)
      this.clicked = false
    } catch (error) {
      this.clicked = false
      this.$toastr.error(error.error?.message || error.message, this.$translate.instant('toast.title_error'))
      console.error(error)
    }
  }

  public downloadCurrentConfig() {
    const dataStr = `data:text/json;charset=utf-8,${encodeURIComponent(this.currentConfig)}`
    const downloadAnchorNode = document.createElement('a')
    downloadAnchorNode.setAttribute('href', dataStr)
    downloadAnchorNode.setAttribute('download', 'config.json')
    document.body.appendChild(downloadAnchorNode) // required for firefox
    downloadAnchorNode.click()
    downloadAnchorNode.remove()
  }

  public async delete(backupId: string) {
    this.deleting = backupId
    try {
      await firstValueFrom(this.$api.delete(`/config-editor/backups/${backupId}`))
      await this.getConfigBackups()
      this.deleting = null
    } catch (error) {
      this.deleting = null
      this.$toastr.error(error.error?.message || error.message, this.$translate.instant('toast.title_error'))
      console.error(error)
    }
  }

  public async deleteAllBackups() {
    this.deleting = 'all'
    try {
      await firstValueFrom(this.$api.delete('/config-editor/backups'))
      this.$toastr.success(this.$translate.instant('config.restore.toast_backups_deleted'), this.$translate.instant('toast.title_success'))
      this.backupList = []
      this.deleting = null
    } catch (error) {
      this.$toastr.error(error.error?.message || error.message, this.$translate.instant('toast.title_error'))
      console.error(error)
      this.deleting = null
    }
  }

  public dismissModal() {
    if (this.fromSettings) {
      this.$router.navigate(['/settings'])
    }
    this.$activeModal.dismiss('Dismiss')
  }
}

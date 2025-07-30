import { HttpErrorResponse, HttpResponse } from '@angular/common/http'
import { Component, ElementRef, HostListener, inject, Input, OnDestroy, OnInit, viewChild } from '@angular/core'
import { NgbActiveModal, NgbModal, NgbTooltip } from '@ng-bootstrap/ng-bootstrap'
import { TranslatePipe, TranslateService } from '@ngx-translate/core'
import { saveAs } from 'file-saver'
import { ToastrService } from 'ngx-toastr'
import { firstValueFrom, Subject } from 'rxjs'

import { ApiService } from '@/app/core/api.service'
import { ConfirmComponent } from '@/app/core/components/confirm/confirm.component'
import { LogService } from '@/app/core/log.service'
import { ChildBridge, Plugin } from '@/app/core/manage-plugins/manage-plugins.interfaces'

@Component({
  templateUrl: './plugin-logs.component.html',
  standalone: true,
  imports: [TranslatePipe, NgbTooltip],
})
export class PluginLogsComponent implements OnInit, OnDestroy {
  private $activeModal = inject(NgbActiveModal)
  private $api = inject(ApiService)
  private $log = inject(LogService)
  private $modal = inject(NgbModal)
  private $toastr = inject(ToastrService)
  private $translate = inject(TranslateService)
  private resizeEvent = new Subject()
  private pluginAlias: string

  @Input() plugin: Plugin
  @Input() childBridges: ChildBridge[] = []

  readonly termTarget = viewChild<ElementRef>('pluginlogoutput')

  public midAction = false

  @HostListener('window:resize', ['$event'])
  onWindowResize() {
    this.resizeEvent.next(undefined)
  }

  public ngOnInit(): void {
    this.getPluginLog()
  }

  public async restartChildBridges() {
    this.midAction = true
    try {
      for (const bridge of this.childBridges) {
        await firstValueFrom(this.$api.put(`/server/restart/${bridge.username}`, {}))
      }
      this.$toastr.success(
        this.$translate.instant('plugins.manage.child_bridge_restart'),
        this.$translate.instant('toast.title_success'),
      )
      this.midAction = false
    } catch (error) {
      console.error(error)
      this.$toastr.error(this.$translate.instant('plugins.manage.child_bridge_restart_failed'), this.$translate.instant('toast.title_error'))
      this.midAction = false
    }
  }

  public downloadLogFile() {
    this.midAction = true
    const ref = this.$modal.open(ConfirmComponent, {
      size: 'lg',
      backdrop: 'static',
    })
    ref.componentInstance.title = this.$translate.instant('logs.title_download_log_file')
    ref.componentInstance.message = this.$translate.instant('logs.download_warning')
    ref.componentInstance.confirmButtonLabel = this.$translate.instant('form.button_download')
    ref.componentInstance.faIconClass = 'fas fa-fw fa-user-secret primary-text'

    ref.result
      .then(() => {
        this.$api.get('/platform-tools/hb-service/log/download?colour=yes', { observe: 'response', responseType: 'text' }).subscribe({
          next: (res: HttpResponse<any>) => {
            if (!res.body) {
              return
            }
            const lines = res.body.split('\n')
            let finalOutput = ''
            let includeNextLine = false

            lines.forEach((line: string) => {
              if (!line) {
                return
              }

              if (includeNextLine) {
                if (line.match(/36m\[.*?\]/)) {
                  includeNextLine = false
                } else {
                  // eslint-disable-next-line no-control-regex
                  finalOutput += `${line.replace(/\x1B\[(\d{1,3}(;\d{1,2})?)?[mGK]/g, '')}\r\n`
                  return
                }
              }

              if (line.includes(`36m[${this.pluginAlias}]`)) {
                // eslint-disable-next-line no-control-regex
                finalOutput += `${line.replace(/\x1B\[(\d{1,3}(;\d{1,2})?)?[mGK]/g, '')}\r\n`
                includeNextLine = true
              }
            })

            saveAs(new Blob([finalOutput], { type: 'text/plain;charset=utf-8' }), `${this.plugin.name}.log.txt`)
            this.midAction = false
          },
          error: async (err: HttpErrorResponse) => {
            let message: string
            try {
              message = JSON.parse(await err.error.text()).message
            } catch (error) {
              console.error(error)
            }
            this.$toastr.error(message || this.$translate.instant('logs.download.error'), this.$translate.instant('toast.title_error'))
            this.midAction = false
          },
        })
      })
      .catch(() => {
        this.midAction = false
      })
  }

  public ngOnDestroy() {
    this.$log.destroyTerminal()
  }

  public dismissModal() {
    this.$activeModal.dismiss('Dismiss')
  }

  private getPluginLog() {
    // Get the plugin name as configured in the config file
    this.$api.get(`/config-editor/plugin/${encodeURIComponent(this.plugin.name)}`).subscribe({
      next: (result) => {
        this.pluginAlias = this.plugin.name === 'homebridge-config-ui-x' ? 'Homebridge UI' : (result[0]?.name || this.plugin.name)
        this.$log.startTerminal(this.termTarget(), {}, this.resizeEvent, this.pluginAlias)
      },
      error: (error) => {
        console.error(error)
        this.$toastr.error(error.error?.message || error.message, this.$translate.instant('toast.title_error'))
        this.$activeModal.dismiss()
      },
    })
  }
}

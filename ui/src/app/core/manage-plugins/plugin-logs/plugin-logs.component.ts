import { ApiService } from '@/app/core/api.service'
import { ConfirmComponent } from '@/app/core/components/confirm/confirm.component'
import { LogService } from '@/app/core/log.service'
import { HttpErrorResponse, HttpResponse } from '@angular/common/http'
import {
  Component,
  ElementRef,
  HostListener,
  Input,
  OnDestroy,
  OnInit,
  ViewChild,
} from '@angular/core'
import { NgbActiveModal, NgbModal } from '@ng-bootstrap/ng-bootstrap'
import { TranslateService } from '@ngx-translate/core'
import { saveAs } from 'file-saver'
import { ToastrService } from 'ngx-toastr'
import { Subject } from 'rxjs'

@Component({
  templateUrl: './plugin-logs.component.html',
})
export class PluginLogsComponent implements OnInit, OnDestroy {
  @Input() plugin: any
  @ViewChild('pluginlogoutput', { static: true }) termTarget: ElementRef
  private resizeEvent = new Subject()
  private pluginAlias: string

  constructor(
    public activeModal: NgbActiveModal,
    private $api: ApiService,
    private $log: LogService,
    private $modal: NgbModal,
    private $toastr: ToastrService,
    private $translate: TranslateService,
  ) {}

  @HostListener('window:resize', ['$event'])
  onWindowResize() {
    this.resizeEvent.next(undefined)
  }

  ngOnInit(): void {
    this.getPluginLog()
  }

  getPluginLog() {
    // Get the plugin name as configured in the config file
    this.$api.get(`/config-editor/plugin/${encodeURIComponent(this.plugin.name)}`).subscribe(
      (result) => {
        this.pluginAlias = this.plugin.name === 'homebridge-config-ui-x' ? 'Homebridge UI' : (result[0]?.name || this.plugin.name)
        this.$log.startTerminal(this.termTarget, {}, this.resizeEvent, this.pluginAlias)
      },
      (err) => {
        this.$toastr.error(`${err.error.message || err.message}`, this.$translate.instant('toast.title_error'))
        this.activeModal.dismiss()
      },
    )
  }

  downloadLogFile() {
    const ref = this.$modal.open(ConfirmComponent, {
      size: 'lg',
      backdrop: 'static',
    })
    ref.componentInstance.title = this.$translate.instant('logs.title_download_log_file')
    ref.componentInstance.message = this.$translate.instant('logs.message_download_warning')
    ref.componentInstance.confirmButtonLabel = this.$translate.instant('logs.label_download')
    ref.componentInstance.faIconClass = 'fas fa-fw fa-user-secret primary-text'

    ref.result.then(() => {
      this.$api.get('/platform-tools/hb-service/log/download?colour=yes', { observe: 'response', responseType: 'text' }).subscribe(
        (res: HttpResponse<any>) => {
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
        },
        async (err: HttpErrorResponse) => {
          let message: string
          try {
            message = JSON.parse(await err.error.text()).message
          } catch (e) {
            // do nothing
          }
          this.$toastr.error(message || 'Failed to download log file', this.$translate.instant('toast.title_error'))
        },
      )
    }).catch(() => {
      // do nothing
    })
  }

  ngOnDestroy() {
    this.$log.destroyTerminal()
  }
}

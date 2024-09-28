import { ApiService } from '@/app/core/api.service'
import { ConfirmComponent } from '@/app/core/components/confirm/confirm.component'
import { LogService } from '@/app/core/log.service'
import { HttpErrorResponse, HttpResponse } from '@angular/common/http'
import { Component, ElementRef, HostListener, OnDestroy, OnInit, ViewChild } from '@angular/core'
import { NgbModal } from '@ng-bootstrap/ng-bootstrap'
import { TranslateService } from '@ngx-translate/core'
import { saveAs } from 'file-saver'
import { ToastrService } from 'ngx-toastr'
import { Subject } from 'rxjs'

@Component({
  templateUrl: './logs.component.html',
})
export class LogsComponent implements OnInit, OnDestroy {
  @ViewChild('logoutput', { static: true }) termTarget: ElementRef
  private resizeEvent = new Subject()

  constructor(
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

  ngOnInit() {
    // set body bg color
    window.document.querySelector('body').classList.add('bg-black')

    // start the terminal
    this.$log.startTerminal(this.termTarget, {}, this.resizeEvent)
  }

  ngOnDestroy() {
    // unset body bg color
    window.document.querySelector('body').classList.remove('bg-black')

    // destroy the terminal
    this.$log.destroyTerminal()
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
      this.$api.get('/platform-tools/hb-service/log/download', { observe: 'response', responseType: 'blob' }).subscribe({
        next: (res: HttpResponse<any>) => {
          saveAs(res.body, 'homebridge.log.txt')
        },
        error: async (err: HttpErrorResponse) => {
          let message: string
          try {
            message = JSON.parse(await err.error.text()).message
          } catch (error) {
            console.error(error)
          }
          this.$toastr.error(message || this.$translate.instant('logs.download.error'), this.$translate.instant('toast.title_error'))
        },
      })
    }).catch(() => {
      // do nothing
    })
  }

  truncateLogFile() {
    const ref = this.$modal.open(ConfirmComponent, {
      size: 'lg',
      backdrop: 'static',
    })
    ref.componentInstance.title = this.$translate.instant('logs.title_truncate_log_file')
    ref.componentInstance.message = this.$translate.instant('logs.message_truncate_log_warning')
    ref.componentInstance.confirmButtonLabel = this.$translate.instant('form.button_delete')
    ref.componentInstance.confirmButtonClass = 'btn-danger'
    ref.componentInstance.faIconClass = 'fas fa-fw fa-circle-exclamation primary-text'

    ref.result
      .then(() => {
        this.$api.put('/platform-tools/hb-service/log/truncate', {}).subscribe({
          next: () => {
            this.$toastr.success(
              this.$translate.instant('logs.message_log_file_truncated'),
              this.$translate.instant('toast.title_success'),
            )
            this.$log.term.clear()
          },
          error: (error: HttpErrorResponse) => {
            console.error(error)
            this.$toastr.error(error.error.message || this.$translate.instant('logs.truncate.error'), this.$translate.instant('toast.title_error'))
          },
        })
      })
      .catch(() => {
        // do nothing
      })
  }
}

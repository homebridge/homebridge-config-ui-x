import { HttpErrorResponse, HttpResponse } from '@angular/common/http'
import { Component, ElementRef, HostListener, inject, OnDestroy, OnInit, viewChild } from '@angular/core'
import { NgbModal, NgbTooltip } from '@ng-bootstrap/ng-bootstrap'
import { TranslatePipe, TranslateService } from '@ngx-translate/core'
import { saveAs } from 'file-saver'
import { ToastrService } from 'ngx-toastr'
import { Subject } from 'rxjs'

import { ApiService } from '@/app/core/api.service'
import { AuthService } from '@/app/core/auth/auth.service'
import { ConfirmComponent } from '@/app/core/components/confirm/confirm.component'
import { LogService } from '@/app/core/log.service'

@Component({
  templateUrl: './logs.component.html',
  standalone: true,
  imports: [NgbTooltip, TranslatePipe],
})
export class LogsComponent implements OnInit, OnDestroy {
  private $api = inject(ApiService)
  private $auth = inject(AuthService)
  private $log = inject(LogService)
  private $modal = inject(NgbModal)
  private $toastr = inject(ToastrService)
  private $translate = inject(TranslateService)

  private readonly termTarget = viewChild<ElementRef>('logoutput')

  private resizeEvent = new Subject()

  public isAdmin = this.$auth.user.admin

  @HostListener('window:resize', ['$event'])
  onWindowResize() {
    this.resizeEvent.next(undefined)
  }

  public ngOnInit() {
    // Set body bg color
    window.document.querySelector('body').classList.add('bg-black')

    // Start the terminal
    this.$log.startTerminal(this.termTarget(), {
      allowProposedApi: true,
    }, this.resizeEvent)
  }

  public ngOnDestroy() {
    // Unset body bg color
    window.document.querySelector('body').classList.remove('bg-black')

    // Destroy the terminal
    this.$log.destroyTerminal()
  }

  public downloadLogFile() {
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
      })
      .catch(() => { /* do nothing */ })
  }

  public truncateLogFile() {
    const ref = this.$modal.open(ConfirmComponent, {
      size: 'lg',
      backdrop: 'static',
    })
    ref.componentInstance.title = this.$translate.instant('logs.title_truncate_log_file')
    ref.componentInstance.message = this.$translate.instant('logs.truncate_log_warning')
    ref.componentInstance.confirmButtonLabel = this.$translate.instant('form.button_delete')
    ref.componentInstance.confirmButtonClass = 'btn-danger'
    ref.componentInstance.faIconClass = 'fas fa-fw fa-circle-exclamation primary-text'

    ref.result
      .then(() => {
        this.$api.put('/platform-tools/hb-service/log/truncate', {}).subscribe({
          next: () => {
            this.$toastr.success(
              this.$translate.instant('logs.log_file_truncated'),
              this.$translate.instant('toast.title_success'),
            )
            this.$log.term.clear()
          },
          error: (error: HttpErrorResponse) => {
            console.error(error)
            this.$toastr.error(error.error?.message || this.$translate.instant('logs.truncate.error'), this.$translate.instant('toast.title_error'))
          },
        })
      })
      .catch(() => { /* do nothing */ })
  }
}

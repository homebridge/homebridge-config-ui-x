import { Component, OnInit, HostListener, OnDestroy, ViewChild, ElementRef } from '@angular/core';
import { HttpResponse, HttpErrorResponse } from '@angular/common/http';
import { TranslateService } from '@ngx-translate/core';
import { Subject } from 'rxjs';
import { saveAs } from 'file-saver';
import { ToastrService } from 'ngx-toastr';

import { AuthService } from '@/app/core/auth/auth.service';
import { ApiService } from '@/app/core/api.service';
import { LogService } from '@/app/core/log.service';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { ConfirmComponent } from '@/app/core/components/confirm/confirm.component';

@Component({
  selector: 'app-logs',
  templateUrl: './logs.component.html',
  styleUrls: ['./logs.component.scss'],
})
export class LogsComponent implements OnInit, OnDestroy {
  @ViewChild('logoutput', { static: true }) termTarget: ElementRef;
  private resizeEvent = new Subject();

  constructor(
    public $auth: AuthService,
    private $api: ApiService,
    private $log: LogService,
    private $toastr: ToastrService,
    private $translate: TranslateService,
    private $modal: NgbModal,
  ) { }

  ngOnInit() {
    // set body bg color
    window.document.querySelector('body').classList.add(`bg-black`);

    // start the terminal
    this.$log.startTerminal(this.termTarget, {}, this.resizeEvent);
  }

  @HostListener('window:resize', ['$event'])
  onWindowResize(event) {
    this.resizeEvent.next();
  }

  ngOnDestroy() {
    // unset body bg color
    window.document.querySelector('body').classList.remove(`bg-black`);

    // destroy the terminal
    this.$log.destroyTerminal();
  }

  downloadLogFile() {
    const ref = this.$modal.open(ConfirmComponent);
    ref.componentInstance.title = this.$translate.instant('logs.title_download_log_file');
    ref.componentInstance.message = this.$translate.instant('logs.message_download_warning');
    ref.componentInstance.confirmButtonLabel = this.$translate.instant('logs.label_download');

    ref.result.then(() => {
      this.$api.get('/platform-tools/hb-service/log/download', { observe: 'response', responseType: 'blob' })
        .subscribe(
          (res: HttpResponse<any>) => {
            saveAs(res.body, 'homebridge.log.txt');
          },
          async (err: HttpErrorResponse) => {
            let message;
            try {
              message = JSON.parse(await err.error.text()).message;
            } catch (e) {
              // do nothing
            }
            this.$toastr.error(message || 'Failed to download log file', this.$translate.instant('toast.title_error'));
          },
        );
    }).catch(() => {
      // do nothing
    });
  }

  truncateLogFile() {
    const ref = this.$modal.open(ConfirmComponent);
    ref.componentInstance.title = this.$translate.instant('logs.title_truncate_log_file');
    ref.componentInstance.message = this.$translate.instant('logs.message_truncate_log_warning');
    ref.componentInstance.confirmButtonLabel = this.$translate.instant('logs.label_truncate');

    ref.result.then(() => {
      this.$api.put('/platform-tools/hb-service/log/truncate', {})
        .subscribe(
          (res) => {
            this.$toastr.success(
              this.$translate.instant('logs.message_log_file_truncated'),
              this.$translate.instant('toast.title_success'),
            );
            this.$log.term.clear();
          },
          (err: HttpErrorResponse) => {
            this.$toastr.error(err.error.message || 'Failed to truncate log file', this.$translate.instant('toast.title_error'));
          },
        );
    }).catch(() => {
      // do nothing
    });
  }

}

export const LogsStates = {
  name: 'logs',
  url: '/logs',
  component: LogsComponent,
  data: {
    requiresAuth: true,
  },
};

import { Component, OnInit, Input, ViewChild, ElementRef } from '@angular/core';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { FormGroup, FormControl, Validators } from '@angular/forms';
import { TranslateService } from '@ngx-translate/core';
import { ToastrService } from 'ngx-toastr';
import * as dayjs from 'dayjs';

import { ApiService } from '@/app/core/api.service';

@Component({
  selector: 'app-users-setup2fa',
  templateUrl: './users-setup2fa.component.html',
  styleUrls: ['./users-setup2fa.component.scss'],
})
export class UsersSetup2faComponent implements OnInit {
  @Input() public user;

  @ViewChild('qrcode', { static: true }) qrcodeElement: ElementRef;

  public timeDiffError: number | null = null;
  public otpString: string;

  public formGroup: FormGroup;

  constructor(
    public activeModal: NgbActiveModal,
    private toastr: ToastrService,
    private translate: TranslateService,
    private $api: ApiService,
  ) { }

  ngOnInit(): void {
    this.formGroup = new FormGroup({
      code: new FormControl('', [Validators.required, Validators.minLength(6), Validators.maxLength(6)]),
    });

    this.$api.post('/users/otp/setup', {}).subscribe(
      data => {
        this.checkTimeDiff(data.timestamp);
        if (!this.timeDiffError) {
          this.otpString = data.otpauth;
        }
      },
      err => {
        this.activeModal.dismiss();
        this.toastr.error(
          err.error.message || 'An error occured while attempting to setup 2FA',
          this.translate.instant('toast.title_error'),
        );
      },
    );
  }

  checkTimeDiff(timestamp) {
    const diffMs = dayjs(timestamp).diff(new Date(), 'millisecond');
    if (diffMs < -5000 || diffMs > 5000) {
      this.timeDiffError = diffMs;
      return;
    }
    this.timeDiffError = null;
  }

  enable2fa() {
    this.$api.post('/users/otp/activate', this.formGroup.value).subscribe(
      data => {
        this.toastr.success(this.translate.instant('users.setup_2fa_enabled_success'), this.translate.instant('toast.title_success'));
        this.activeModal.close();
      },
      err => {
        this.toastr.error(err.error.message || 'An error occured', this.translate.instant('toast.title_error'));
      },
    );
  }

}

import { Component, OnInit } from '@angular/core';
import { FormGroup, FormControl, Validators } from '@angular/forms';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { ToastrService } from 'ngx-toastr';
import { TranslateService } from '@ngx-translate/core';

import { ApiService } from '@/app/core/api.service';

@Component({
  selector: 'app-users-disable2fa',
  templateUrl: './users-disable2fa.component.html',
  styleUrls: ['./users-disable2fa.component.scss'],
})
export class UsersDisable2faComponent implements OnInit {

  public formGroup: FormGroup;
  public invalidCredentials = false;

  constructor(
    public activeModal: NgbActiveModal,
    private toastr: ToastrService,
    private translate: TranslateService,
    private $api: ApiService,
  ) { }

  ngOnInit(): void {
    this.formGroup = new FormGroup({
      password: new FormControl('', [Validators.required]),
    });
  }

  disable2fa() {
    this.invalidCredentials = false;
    this.$api.post('/users/otp/deactivate', this.formGroup.value).subscribe(
      data => {
        this.activeModal.close();
        this.toastr.success(this.translate.instant('users.setup_2fa_disable_success'), this.translate.instant('toast.title_success'));
      },
      err => {
        this.formGroup.setValue({ password: '' });
        this.invalidCredentials = true;
      },
    );
  }

}

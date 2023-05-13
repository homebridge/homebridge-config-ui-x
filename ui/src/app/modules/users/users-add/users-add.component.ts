import { Component, OnInit } from '@angular/core';
import { FormControl, FormGroup, Validators } from '@angular/forms';
import { AbstractControl } from '@angular/forms';
import { TranslateService } from '@ngx-translate/core';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { ToastrService } from 'ngx-toastr';

import { ApiService } from '@/app/core/api.service';

@Component({
  selector: 'app-users-add',
  templateUrl: './users-add.component.html',
})
export class UsersAddComponent implements OnInit {
  form = new FormGroup({
    username: new FormControl('', [Validators.required]),
    name: new FormControl('', [Validators.required]),
    password: new FormControl('', [Validators.compose([Validators.required, Validators.minLength(4)])]),
    passwordConfirm: new FormControl('', [Validators.required]),
    admin: new FormControl(true),
  }, this.matchPassword);

  page = {
    title: 'users.title_add_user',
    save: 'users.button_add_new_user',
    password: 'users.label_password',
  };

  constructor(
    public activeModal: NgbActiveModal,
    public toastr: ToastrService,
    private translate: TranslateService,
    private $api: ApiService,
  ) { }

  ngOnInit(): void {

  }

  matchPassword(AC: AbstractControl) {
    const password = AC.get('password').value;
    const passwordConfirm = AC.get('passwordConfirm').value;
    if (password !== passwordConfirm) {
      AC.get('passwordConfirm').setErrors({ matchPassword: true });
    } else {
      return null;
    }
  }

  onSubmit({ value, valid }) {
    this.$api.post(`/users`, value).subscribe(
      data => {
        this.activeModal.close();
        this.toastr.success(this.translate.instant('users.toast_added_new_user'), this.translate.instant('toast.title_success'));
      },
      err => {
        this.toastr.error(
          err.error.message || this.translate.instant('users.toast_failed_to_add_user'),
          this.translate.instant('toast.title_error'),
        );
      },
    );
  }

}

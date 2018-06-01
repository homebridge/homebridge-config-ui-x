import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { AbstractControl } from '@angular/forms/src/model';
import { TranslateService } from '@ngx-translate/core';
import { StateService } from '@uirouter/angular';
import { ToastrService } from 'ngx-toastr';

import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { ApiService } from '../_services/api.service';

@Component({
  selector: 'app-users-add',
  templateUrl: './users.add-edit.component.html'
})
export class UsersAddComponent implements OnInit {
  form: FormGroup;
  page = {
    title: 'users.title_add_user',
    save: 'users.button_add_new_user',
    password: 'users.label_password'
  };

  constructor(
    public activeModal: NgbActiveModal,
    public toastr: ToastrService,
    private translate: TranslateService,
    private $api: ApiService,
    private $state: StateService,
    public $fb: FormBuilder
  ) { }

  ngOnInit() {
    this.form = this.$fb.group({
      username: ['', Validators.required],
      name: ['', Validators.required],
      password: ['', Validators.compose([Validators.required, Validators.minLength(4)])],
      passwordConfirm: ['', Validators.required],
      admin: [true]
    }, {
      validator: this.matchPassword
    });
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
    this.$api.addNewUser(value).subscribe(
      async data => {
        const toastSuccess = await this.translate.get('toast.title_success').toPromise();
        const toastAddedNewUser = await this.translate.get('users.toast_added_new_user').toPromise();
        this.$state.reload();
        this.activeModal.close();
        this.toastr.success(toastAddedNewUser, toastSuccess);
      },
      async err => {
        const toastError = await this.translate.get('toast.title_error').toPromise();
        const toastFailedToAddUser = await this.translate.get('users.toast_failed_to_add_user').toPromise();
        this.toastr.error(toastFailedToAddUser, toastError);
      }
    );
  }

}

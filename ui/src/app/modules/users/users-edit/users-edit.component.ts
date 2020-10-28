import { Component, OnInit, Input } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { AbstractControl } from '@angular/forms';
import { TranslateService } from '@ngx-translate/core';
import { ToastrService } from 'ngx-toastr';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';

import { ApiService } from '@/app/core/api.service';
import { AuthService } from '@/app/core/auth/auth.service';

@Component({
  selector: 'app-users-edit',
  templateUrl: './users-edit.component.html',
})
export class UsersEditComponent implements OnInit {
  @Input() user;

  public form: FormGroup;
  public page = {
    title: 'users.title_edit_user',
    save: 'form.button_save',
    password: 'users.label_new_password',
  };

  public isCurrentUser = false;

  constructor(
    public activeModal: NgbActiveModal,
    public toastr: ToastrService,
    private translate: TranslateService,
    private $api: ApiService,
    private $auth: AuthService,
    public $fb: FormBuilder,
  ) { }

  ngOnInit() {
    this.isCurrentUser = this.$auth.user.username === this.user.username;

    this.form = this.$fb.group({
      username: ['', Validators.required],
      name: ['', Validators.required],
      password: ['', Validators.minLength(4)],
      passwordConfirm: [''],
      admin: [true],
    }, {
      validator: this.matchPassword,
    });

    this.form.patchValue(this.user);
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
    this.$api.patch(`/users/${this.user.id}`, value).subscribe(
      data => {
        this.activeModal.close();
        this.toastr.success(this.translate.instant('users.toast_updated_user'), this.translate.instant('toast.title_success'));

        if (this.isCurrentUser && value.username !== this.$auth.user.username) {
          this.$auth.logout();
        }
      },
      err => {
        this.toastr.error(err.error.message || this.translate.instant('users.toast_failed_to_add_user'), this.translate.instant('toast.title_error'));
      },
    );
  }

}

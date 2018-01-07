import { Component, OnInit, Input } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { AbstractControl } from '@angular/forms/src/model';
import { StateService } from '@uirouter/angular';
import { ToastsManager } from 'ng2-toastr/ng2-toastr';

import { NgbModal, NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { ApiService } from '../_services/api.service';

@Component({
  selector: 'app-users-edit',
  templateUrl: './users.add-edit.component.html'
})
export class UsersEditComponent implements OnInit {
  @Input() user;
  form: FormGroup;
  page = {
    title: 'Edit User',
    save: 'Save',
    password: 'New Password'
  };

  constructor(
    public activeModal: NgbActiveModal,
    public toastr: ToastsManager,
    private $api: ApiService,
    private $state: StateService,
    public $fb: FormBuilder
  ) { }

  ngOnInit() {
    this.form = this.$fb.group({
      username: ['', Validators.required],
      name: ['', Validators.required],
      password: ['', Validators.minLength(4)],
      passwordConfirm: [''],
      admin: [true]
    }, {
      validator: this.matchPassword
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
    this.$api.updateUser(this.user.id, value).subscribe(
      data => {
        this.$state.reload();
        this.activeModal.close();
        this.toastr.success(`Updated User`, 'Success!');
      },
      err => {
        this.toastr.error(`Failed To Update User`, 'Error');
      }
    );
  }

}

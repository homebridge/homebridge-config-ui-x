import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { AbstractControl } from '@angular/forms/src/model';
import { StateService } from '@uirouter/angular';
import { ToastsManager } from 'ng2-toastr/ng2-toastr';

import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { ApiService } from '../_services/api.service';

@Component({
  selector: 'app-users-add',
  templateUrl: './users.add-edit.component.html'
})
export class UsersAddComponent implements OnInit {
  form: FormGroup;
  page = {
    title: 'Add User',
    save: 'Add New User',
    password: 'Password'
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
      data => {
        this.$state.reload();
        this.activeModal.close();
        this.toastr.success(`Added New User`, 'Success!');
      },
      err => {
        this.toastr.error(`Failed To Add User`, 'Error');
      }
    );
  }

}

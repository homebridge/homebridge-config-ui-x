import { Component, OnInit, AfterViewInit } from '@angular/core';
import { TargetState, StateService } from '@uirouter/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';

import { AuthService } from '../_services/auth.service';

@Component({
  selector: 'app-login',
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.scss']
})
class LoginComponent implements OnInit {
  form: FormGroup;
  returnTo: TargetState;

  constructor(
    public $fb: FormBuilder,
    private $state: StateService,
    private $auth: AuthService
  ) { }

  ngOnInit() {
    this.returnTo = this.$state.params.returnTo;

    this.form = this.$fb.group({
      username: ['', Validators.required],
      password: ['', Validators.required],
      admin: [true]
    });

    window.document.getElementById('form-username').focus();
  }

  onSubmit({ value, valid }) {
    this.$auth.login(value.username, value.password)
      .then((user) => {
        this.$state.go(this.returnTo.name(), this.returnTo.params());
      });
  }
}

const LoginStates = {
  name: 'login',
  component: LoginComponent,
  data: {
    requiresAuth: false
  },
  params: {
    returnTo: {}
  }
};

export { LoginComponent, LoginStates };

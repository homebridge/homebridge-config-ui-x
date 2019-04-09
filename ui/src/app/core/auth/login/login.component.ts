import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { RouterModule, Routes, Router } from '@angular/router';

import { AuthService } from '../auth.service';

@Component({
  selector: 'app-login',
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.scss']
})
export class LoginComponent implements OnInit {
  public form: FormGroup;
  public invalidCredentials = false;
  public inProgress = false;
  private targetRoute;

  constructor(
    private $fb: FormBuilder,
    private $router: Router,
    private $auth: AuthService
  ) { }

  ngOnInit() {
    this.form = this.$fb.group({
      username: ['', Validators.required],
      password: ['', Validators.required]
    });

    this.targetRoute = window.sessionStorage.getItem('target_route') || '';
  }

  async onSubmit({ value, valid }) {
    this.invalidCredentials = false;
    this.inProgress = true;
    await this.$auth.login(value.username, value.password)
      .then((user) => {
        this.$router.navigateByUrl(this.targetRoute);
        window.sessionStorage.removeItem('target_route');
      })
      .catch((err) => {
        this.invalidCredentials = true;
      });

    this.inProgress = false;
  }

}

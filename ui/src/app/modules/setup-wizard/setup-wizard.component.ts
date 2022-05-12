import { Component, OnDestroy, OnInit } from '@angular/core';
import { AbstractControl, FormControl, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { Title } from '@angular/platform-browser';
import { TranslateService } from '@ngx-translate/core';
import { ToastrService } from 'ngx-toastr';

import { ApiService } from '@/app/core/api.service';
import { AuthService } from '@/app/core/auth/auth.service';
import { SettingsService } from '@/app/core/settings.service';

@Component({
  selector: 'app-setup-wizard',
  templateUrl: './setup-wizard.component.html',
  styleUrls: ['./setup-wizard.component.scss'],
})
export class SetupWizardComponent implements OnInit, OnDestroy {
  public previousTitle: string;
  public step: 'welcome' | 'create-account' | 'setup-complete' = 'welcome';

  public createUserForm: FormGroup;
  public loading = false;

  constructor(
    private $router: Router,
    private $translate: TranslateService,
    private $toastr: ToastrService,
    private $title: Title,
    private $api: ApiService,
    private $auth: AuthService,
    private $settings: SettingsService,
  ) { }

  ngOnInit(): void {
    this.previousTitle = this.$title.getTitle();
    this.$title.setTitle('Setup Homebridge');
    window.document.querySelector('body').classList.remove(`body-top-padding`);

    this.createUserForm = new FormGroup({
      username: new FormControl('', [Validators.required]),
      password: new FormControl('', [Validators.compose([Validators.required, Validators.minLength(4)])]),
      passwordConfirm: new FormControl('', [Validators.required]),
    }, this.matchPassword);
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

  ngOnDestroy() {
    this.$title.setTitle(this.previousTitle);
    window.document.querySelector('body').classList.add(`body-top-padding`);
  }

  onClickGettingStarted() {
    this.step = 'create-account';
  }

  createFirstUser() {
    this.loading = true;

    const payload = this.createUserForm.value;
    payload.name = payload.username;

    this.$api.post('/setup-wizard/create-first-user', payload).subscribe(
      async (success) => {
        this.$settings.env.setupWizardComplete = true;
        await this.$auth.login({
          username: payload.username,
          password: payload.password,
        });
        this.step = 'setup-complete';
      },
      (err) => {
        this.loading = false;
        this.$toastr.error(
          err.error.message || this.$translate.instant('users.toast_failed_to_add_user'),
          this.$translate.instant('toast.title_error'),
        );
      });
  }

}

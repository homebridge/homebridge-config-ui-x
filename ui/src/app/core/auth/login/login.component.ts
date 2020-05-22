import { Component, OnInit, OnDestroy } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';

import { AuthService } from '../auth.service';
import { environment } from '@/environments/environment';

@Component({
  selector: 'app-login',
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.scss'],
})
export class LoginComponent implements OnInit {
  public form: FormGroup;
  public backgroundStyle: string;
  public invalidCredentials = false;
  public inProgress = false;
  private targetRoute;

  constructor(
    private $fb: FormBuilder,
    private $router: Router,
    public $auth: AuthService,
  ) { }

  ngOnInit() {
    this.form = this.$fb.group({
      username: ['', Validators.required],
      password: ['', Validators.required],
    });

    this.targetRoute = window.sessionStorage.getItem('target_route') || '';
    this.setBackground();
  }

  async setBackground() {
    if (!this.$auth.settingsLoaded) {
      await this.$auth.onSettingsLoaded.toPromise();
    }

    const backgroundImageUrl = this.$auth.env.customWallpaperHash ?
      environment.api.base + '/auth/wallpaper/' + this.$auth.env.customWallpaperHash :
      '/assets/snapshot.jpg';
    this.backgroundStyle = `url('${backgroundImageUrl}') no-repeat center center fixed`;
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

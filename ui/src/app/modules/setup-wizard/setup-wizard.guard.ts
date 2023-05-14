import { SettingsService } from '@/app/core/settings.service';
import { Injectable } from '@angular/core';
import { ActivatedRouteSnapshot, CanActivate, Router, RouterStateSnapshot } from '@angular/router';

@Injectable({
  providedIn: 'root',
})
export class SetupWizardGuard implements CanActivate {
  constructor(
    private $router: Router,
    private $settings: SettingsService,
  ) { }

  async canActivate(
    route: ActivatedRouteSnapshot,
    state: RouterStateSnapshot): Promise<boolean> {

    if (!this.$settings.settingsLoaded) {
      await this.$settings.onSettingsLoaded.toPromise();
    }

    if (this.$settings.env.setupWizardComplete === false) {
      return true;
    }

    this.$router.navigate(['/']);

    return true;
  }

}

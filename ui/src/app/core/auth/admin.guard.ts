import { Injectable } from '@angular/core';
import { CanActivate, ActivatedRouteSnapshot, RouterStateSnapshot, Router } from '@angular/router';
import { Observable } from 'rxjs';
import { ToastrService } from 'ngx-toastr';

import { AuthService } from './auth.service';

@Injectable({
  providedIn: 'root',
})
export class AdminGuard implements CanActivate {
  constructor(
    private $auth: AuthService,
    private $toast: ToastrService,
    private $router: Router,
  ) { }

  canActivate(
    next: ActivatedRouteSnapshot,
    state: RouterStateSnapshot): Observable<boolean> | Promise<boolean> | boolean {
    if (this.$auth.user && this.$auth.user.admin) {
      return true;
    } else {
      this.$toast.error('Only Administrators may access the requested page.');
      this.$router.navigate(['/']);
      return false;
    }
  }
}

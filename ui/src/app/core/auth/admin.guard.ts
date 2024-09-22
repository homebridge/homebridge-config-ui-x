import { AuthService } from '@/app/core/auth/auth.service'
import { Injectable } from '@angular/core'
import { CanActivate, Router } from '@angular/router'
import { TranslateService } from '@ngx-translate/core'
import { ToastrService } from 'ngx-toastr'
import { Observable } from 'rxjs'

@Injectable({
  providedIn: 'root',
})
export class AdminGuard implements CanActivate {
  constructor(
    private $auth: AuthService,
    private $router: Router,
    private $translate: TranslateService,
    private $toast: ToastrService,
  ) {}

  canActivate(): Observable<boolean> | Promise<boolean> | boolean {
    if (this.$auth.user && this.$auth.user.admin) {
      return true
    } else {
      this.$toast.error('Only administrators may access the requested page.', this.$translate.instant('toast.title_error'))
      this.$router.navigate(['/'])
      return false
    }
  }
}

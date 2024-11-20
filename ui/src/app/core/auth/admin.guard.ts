import { AuthService } from '@/app/core/auth/auth.service'
import { inject, Injectable } from '@angular/core'
import { CanActivate, Router } from '@angular/router'
import { TranslateService } from '@ngx-translate/core'
import { ToastrService } from 'ngx-toastr'
import { Observable } from 'rxjs'

@Injectable({
  providedIn: 'root',
})
export class AdminGuard implements CanActivate {
  private $auth = inject(AuthService)
  private $router = inject(Router)
  private $translate = inject(TranslateService)
  private $toastr = inject(ToastrService)

  canActivate(): Observable<boolean> | Promise<boolean> | boolean {
    if (this.$auth.user && this.$auth.user.admin) {
      return true
    } else {
      this.$toastr.error(this.$translate.instant('toast.no_auth'), this.$translate.instant('toast.title_error'))
      this.$router.navigate(['/'])
      return false
    }
  }
}

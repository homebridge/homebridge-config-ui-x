import { ApiService } from '@/app/core/api.service'
import { Injectable } from '@angular/core'
import { Resolve, Router } from '@angular/router'
import { TranslateService } from '@ngx-translate/core'
import { ToastrService } from 'ngx-toastr'
import { firstValueFrom } from 'rxjs'

@Injectable()
export class StartupScriptResolver implements Resolve<any> {
  constructor(
    private $api: ApiService,
    private $router: Router,
    private $toastr: ToastrService,
    private $translate: TranslateService,
  ) {}

  async resolve() {
    try {
      // return await firstValueFrom(this.$api.get('/platform-tools/docker/startup-script'))
    } catch (err) {
      this.$toastr.error(err.message, this.$translate.instant('toast.title_error'))
      this.$router.navigate(['/'])
    }
  }
}

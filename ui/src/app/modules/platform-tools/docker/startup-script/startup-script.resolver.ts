import { ApiService } from '@/app/core/api.service'
import { Injectable } from '@angular/core'
import { Resolve, Router } from '@angular/router'
import { ToastrService } from 'ngx-toastr'

@Injectable()
export class StartupScriptResolver implements Resolve<any> {
  constructor(
    private $api: ApiService,
    private $toastr: ToastrService,
    private $router: Router,
  ) {}

  async resolve() {
    try {
      return await this.$api.get('/platform-tools/docker/startup-script').toPromise()
    } catch (err) {
      this.$toastr.error(err.message, 'Failed to Load Startup Script')
      this.$router.navigate(['/'])
    }
  }
}

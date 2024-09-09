import { ApiService } from '@/app/core/api.service'
import { Injectable } from '@angular/core'
import { Resolve, Router } from '@angular/router'
import { ToastrService } from 'ngx-toastr'

@Injectable()
export class ConfigEditorResolver implements Resolve<any> {
  constructor(
    private $api: ApiService,
    private $toastr: ToastrService,
    private $router: Router,
  ) {}

  async resolve() {
    try {
      const json = await this.$api.get('/config-editor').toPromise()
      return JSON.stringify(json, null, 4)
    } catch (err) {
      this.$toastr.error(err.message, 'Failed to Load Config')
      this.$router.navigate(['/'])
    }
  }
}

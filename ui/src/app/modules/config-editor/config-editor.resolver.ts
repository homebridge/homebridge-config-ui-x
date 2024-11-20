import { ApiService } from '@/app/core/api.service'
import { inject, Injectable } from '@angular/core'
import { Resolve, Router } from '@angular/router'
import { TranslateService } from '@ngx-translate/core'
import { ToastrService } from 'ngx-toastr'
import { firstValueFrom } from 'rxjs'

@Injectable()
export class ConfigEditorResolver implements Resolve<any> {
  private $api = inject(ApiService)
  private $router = inject(Router)
  private $toastr = inject(ToastrService)
  private $translate = inject(TranslateService)

  async resolve() {
    try {
      const json = await firstValueFrom(this.$api.get('/config-editor'))
      return JSON.stringify(json, null, 4)
    } catch (error) {
      console.error(error)
      this.$toastr.error(error.message, this.$translate.instant('toast.title_error'))
      this.$router.navigate(['/'])
    }
  }
}

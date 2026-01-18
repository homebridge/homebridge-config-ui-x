import { Component, inject } from '@angular/core'
import { TranslatePipe, TranslateService } from '@ngx-translate/core'
import { saveAs } from 'file-saver'
import { ToastrService } from 'ngx-toastr'

import { ApiService } from '@/app/core/communication/api.service'

@Component({
  selector: 'app-homebridge-deconz',
  templateUrl: './homebridge-deconz.component.html',
  standalone: true,
  imports: [
    TranslatePipe,
  ],
})
export class HomebridgeDeconzComponent {
  private $api = inject(ApiService)
  private $toastr = inject(ToastrService)
  private $translate = inject(TranslateService)

  public async downloadDumpFile(): Promise<void> {
    try {
      const res = await this.$api.get('/plugins/custom-plugins/homebridge-deconz/dump-file', { observe: 'response', responseType: 'blob' })
      saveAs(res.body, 'homebridge-deconz.json.gz')
    } catch (error) {
      console.error(error)
      this.$toastr.error(this.$translate.instant('plugins.settings.deconz.dump_no_exist'), this.$translate.instant('toast.title_error'))
    }
  }
}

import { Component, inject } from '@angular/core'
import { TranslatePipe, TranslateService } from '@ngx-translate/core'
import { saveAs } from 'file-saver'
import { ToastrService } from 'ngx-toastr'

import { ApiService } from '@/app/core/communication/api.service'

@Component({
  selector: 'app-homebridge-hue',
  templateUrl: './homebridge-hue.component.html',
  standalone: true,
  imports: [
    TranslatePipe,
  ],
})
export class HomebridgeHueComponent {
  private $api = inject(ApiService)
  private $translate = inject(TranslateService)
  private $toastr = inject(ToastrService)

  public async downloadDumpFile(): Promise<void> {
    try {
      const res = await this.$api.get('/plugins/custom-plugins/homebridge-hue/dump-file', { observe: 'response', responseType: 'blob' })
      saveAs(res.body, 'homebridge-hue.json.gz')
    } catch (error) {
      console.error(error)
      this.$toastr.error(this.$translate.instant('plugins.settings.hue.dump_no_exist'), this.$translate.instant('toast.title_error'))
    }
  }
}

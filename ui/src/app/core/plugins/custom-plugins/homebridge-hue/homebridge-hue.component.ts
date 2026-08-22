import { ChangeDetectionStrategy, Component, inject } from '@angular/core'
import { TranslatePipe, TranslateService } from '@ngx-translate/core'
import { ToastrService } from 'ngx-toastr'

import { ApiService } from '@/app/core/communication/api.service'
import { SAVE_AS } from '@/app/core/utilities/file-saver.factory'

@Component({
  selector: 'app-homebridge-hue',
  imports: [
    TranslatePipe,
  ],
  standalone: true,
  templateUrl: './homebridge-hue.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HomebridgeHueComponent {
  private $saveAs = inject(SAVE_AS)
  private $api = inject(ApiService)
  private $translate = inject(TranslateService)
  private $toastr = inject(ToastrService)

  public async downloadDumpFile(): Promise<void> {
    try {
      const res = await this.$api.get('/plugins/custom-plugins/homebridge-hue/dump-file', { observe: 'response', responseType: 'blob' })
      this.$saveAs(res.body, 'homebridge-hue.json.gz')
    } catch (error) {
      console.error(error)
      this.$toastr.error(this.$translate.instant('plugins.settings.hue.dump_no_exist'), this.$translate.instant('toast.title_error'))
    }
  }
}

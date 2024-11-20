import { ApiService } from '@/app/core/api.service'
import { Component, inject } from '@angular/core'
import { TranslateService } from '@ngx-translate/core'
import { saveAs } from 'file-saver'
import { ToastrService } from 'ngx-toastr'

@Component({
  selector: 'app-homebridge-hue',
  templateUrl: './homebridge-hue.component.html',
  standalone: true,
})
export class HomebridgeHueComponent {
  private $api = inject(ApiService)
  private $translate = inject(TranslateService)
  private $toastr = inject(ToastrService)

  downloadDumpFile() {
    this.$api.get('/plugins/custom-plugins/homebridge-hue/dump-file', { observe: 'response', responseType: 'blob' }).subscribe({
      next: (res) => {
        saveAs(res.body, 'homebridge-hue.json.gz')
      },
      error: (error) => {
        console.error(error)
        this.$toastr.error(this.$translate.instant('plugins.settings.hue.dump_no_exist'), this.$translate.instant('toast.title_error'))
      },
    })
  }
}

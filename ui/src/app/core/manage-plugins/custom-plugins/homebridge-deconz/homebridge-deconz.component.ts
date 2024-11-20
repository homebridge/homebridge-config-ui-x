import { ApiService } from '@/app/core/api.service'
import { Component, inject } from '@angular/core'
import { TranslateService } from '@ngx-translate/core'
import { saveAs } from 'file-saver'
import { ToastrService } from 'ngx-toastr'

@Component({
  selector: 'app-homebridge-deconz',
  templateUrl: './homebridge-deconz.component.html',
  standalone: true,
})
export class HomebridgeDeconzComponent {
  private $api = inject(ApiService)
  private $toastr = inject(ToastrService)
  private $translate = inject(TranslateService)

  downloadDumpFile() {
    this.$api.get('/plugins/custom-plugins/homebridge-deconz/dump-file', { observe: 'response', responseType: 'blob' }).subscribe({
      next: (res) => {
        saveAs(res.body, 'homebridge-deconz.json.gz')
      },
      error: (error) => {
        console.error(error)
        this.$toastr.error(this.$translate.instant('plugins.settings.deconz.dump_no_exist'), this.$translate.instant('toast.title_error'))
      },
    })
  }
}

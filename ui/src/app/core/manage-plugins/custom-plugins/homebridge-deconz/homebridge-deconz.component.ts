import { ApiService } from '@/app/core/api.service'
import { Component } from '@angular/core'
import { TranslateService } from '@ngx-translate/core'
import { saveAs } from 'file-saver'
import { ToastrService } from 'ngx-toastr'

@Component({
  selector: 'app-homebridge-deconz',
  templateUrl: './homebridge-deconz.component.html',
})
export class HomebridgeDeconzComponent {
  constructor(
    private $api: ApiService,
    private $toastr: ToastrService,
    private $translate: TranslateService,
  ) {}

  downloadDumpFile() {
    this.$api.get('/plugins/custom-plugins/homebridge-deconz/dump-file', { observe: 'response', responseType: 'blob' }).subscribe({
      next: (res) => {
        saveAs(res.body, 'homebridge-deconz.json.gz')
      },
      error: () => {
        this.$toastr.error('Homebridge deCONZ dump file does not exist yet.', this.$translate.instant('toast.title_error'))
      },
    })
  }
}

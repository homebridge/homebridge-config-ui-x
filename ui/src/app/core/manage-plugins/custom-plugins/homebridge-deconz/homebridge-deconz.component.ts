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
    private translate: TranslateService,
    public $toastr: ToastrService,
    private $api: ApiService,
  ) {}

  downloadDumpFile() {
    this.$api.get('/plugins/custom-plugins/homebridge-deconz/dump-file', { observe: 'response', responseType: 'blob' }).subscribe(
      (res) => {
        saveAs(res.body, 'homebridge-deconz.json.gz')
      },
      () => {
        this.$toastr.error('Homebridge deCONZ dump file does not exist yet.', this.translate.instant('toast.title_error'))
      },
    )
  }
}

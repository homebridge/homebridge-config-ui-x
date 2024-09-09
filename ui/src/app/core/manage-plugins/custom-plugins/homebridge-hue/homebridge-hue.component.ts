import { ApiService } from '@/app/core/api.service'
import { Component } from '@angular/core'
import { TranslateService } from '@ngx-translate/core'
import { saveAs } from 'file-saver'
import { ToastrService } from 'ngx-toastr'

@Component({
  selector: 'app-homebridge-hue',
  templateUrl: './homebridge-hue.component.html',
})
export class HomebridgeHueComponent {
  constructor(
    private translate: TranslateService,
    public $toastr: ToastrService,
    private $api: ApiService,
  ) {}

  downloadDumpFile() {
    this.$api.get('/plugins/custom-plugins/homebridge-hue/dump-file', { observe: 'response', responseType: 'blob' }).subscribe(
      (res) => {
        saveAs(res.body, 'homebridge-hue.json.gz')
      },
      () => {
        this.$toastr.error('Homebridge Hue dump file does not exist yet.', this.translate.instant('toast.title_error'))
      },
    )
  }
}

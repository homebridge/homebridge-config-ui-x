import { Component } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { ToastrService } from 'ngx-toastr';
import { saveAs } from 'file-saver';
import { ApiService } from '../../../../core/api.service';

@Component({
  selector: 'app-homebridge-hue',
  templateUrl: './homebridge-hue.component.html',
  styleUrls: ['./homebridge-hue.component.scss'],
})
export class HomebridgeHueComponent {

  constructor(
    private translate: TranslateService,
    public $toastr: ToastrService,
    private $api: ApiService,
  ) { }

  downloadDumpFile() {
    this.$api.get('/plugins/custom-plugins/homebridge-hue/dump-file', { observe: 'response', responseType: 'blob' })
      .subscribe(
        (res) => {
          saveAs(res.body, 'homebridge-hue.json.gz');
        },
        (err) => {
          this.$toastr.error('Homebridge Hue dump file does not exist yet.', this.translate.instant('toast.title_error'));
        },
      );
  }

}

import { Component } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { saveAs } from 'file-saver';
import { ToastrService } from 'ngx-toastr';
import { ApiService } from '@/app/core/api.service';

@Component({
  selector: 'app-homebridge-deconz',
  templateUrl: './homebridge-deconz.component.html',
  styleUrls: ['./homebridge-deconz.component.scss'],
})
export class HomebridgeDeconzComponent {

  constructor(
    private translate: TranslateService,
    public $toastr: ToastrService,
    private $api: ApiService,
  ) {}

  downloadDumpFile() {
    this.$api.get('/plugins/custom-plugins/homebridge-deconz/dump-file', { observe: 'response', responseType: 'blob' })
      .subscribe(
        (res) => {
          saveAs(res.body, 'homebridge-deconz.json.gz');
        },
        (err) => {
          this.$toastr.error('Homebridge Deconz dump file does not exist yet.', this.translate.instant('toast.title_error'));
        },
      );
  }
}

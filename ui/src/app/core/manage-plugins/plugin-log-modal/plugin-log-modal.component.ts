import {
  Component,
  ElementRef,
  HostListener,
  Input,
  OnDestroy,
  OnInit,
  ViewChild,
} from '@angular/core';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { TranslateService } from '@ngx-translate/core';
import { ToastrService } from 'ngx-toastr';
import { Subject } from 'rxjs';
import { ApiService } from '@/app/core/api.service';
import { LogService } from '@/app/core/log.service';

@Component({
  selector: 'app-plugin-log-modal',
  templateUrl: './plugin-log-modal.component.html',
  styleUrls: ['./plugin-log-modal.component.scss'],
})
export class PluginLogModalComponent implements OnInit, OnDestroy {
  @Input() plugin: any;
  @ViewChild('pluginlogoutput', { static: true }) termTarget: ElementRef;
  private resizeEvent = new Subject();

  constructor(
    public activeModal: NgbActiveModal,
    private $api: ApiService,
    private $log: LogService,
    private $toastr: ToastrService,
    private $translate: TranslateService,
  ) { }

  @HostListener('window:resize', ['$event'])
  onWindowResize() {
    this.resizeEvent.next(undefined);
  }

  ngOnInit(): void {
    this.getPluginLog();
  }

  getPluginLog() {
    // Get the plugin name as configured in the config file
    console.log(this.plugin);
    this.$api.get(`/config-editor/plugin/${encodeURIComponent(this.plugin.name)}`).subscribe(
      (result) => {
        const logAlias = this.plugin.name === 'homebridge-config-ui-x' ? 'Homebridge UI' : (result[0]?.name || this.plugin.name);
        this.$log.startTerminal(this.termTarget, {}, this.resizeEvent, logAlias);
      },
      (err) => {
        this.$toastr.error(`${err.error.message || err.message}`, this.$translate.instant('toast.title_error'));
        this.activeModal.dismiss();
      },
    );
  }

  ngOnDestroy() {
    this.$log.destroyTerminal();
  }
}

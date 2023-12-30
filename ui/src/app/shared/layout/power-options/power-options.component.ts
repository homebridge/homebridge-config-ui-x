import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { ToastrService } from 'ngx-toastr';
import { ApiService } from '@/app/core/api.service';
import { SettingsService } from '@/app/core/settings.service';

@Component({
  selector: 'app-power-options',
  templateUrl: './power-options.component.html',
  styleUrls: ['./power-options.component.scss'],
})
export class PowerOptionsComponent implements OnInit {
  constructor(
    public activeModal: NgbActiveModal,
    private $api: ApiService,
    private $router: Router,
    public $settings: SettingsService,
    public $toastr: ToastrService,
  ) { }

  ngOnInit() {}

  restartHomebridge() {
    this.$router.navigate(['/restart']);
    this.activeModal.close();
  }

  restartHomebridgeService() {
    this.$api.put('/platform-tools/hb-service/set-full-service-restart-flag', {}).subscribe(
      () => {
        this.$router.navigate(['/restart']);
        this.activeModal.close();
      },
      (err) => {
        this.$toastr.error(err.message, 'Failed to set force service restart flag.');
      },
    );
  }

  restartServer() {
    this.$router.navigate(['/platform-tools/linux/restart-server']);
    this.activeModal.close();
  }

  shutdownServer() {
    this.$router.navigate(['/platform-tools/linux/shutdown-server']);
    this.activeModal.close();
  }

  dockerStartupScript() {
    this.$router.navigate(['/platform-tools/docker/startup-script']);
    this.activeModal.close();
  }

  dockerRestartContainer() {
    this.$router.navigate(['/platform-tools/docker/restart-container']);
    this.activeModal.close();
  }
}

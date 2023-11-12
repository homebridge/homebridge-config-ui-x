import { Component, OnInit } from '@angular/core';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { SettingsService } from '@/app/core/settings.service';
import { Router } from '@angular/router';

@Component({
  selector: 'app-confirm',
  templateUrl: './restart-options-modal.component.html',
  styleUrls: ['./restart-options-modal.component.scss'],
})
export class RestartOptionsModalComponent implements OnInit {
  constructor(
    public activeModal: NgbActiveModal,
    private $router: Router,
    public $settings: SettingsService,
  ) { }

  ngOnInit() {}

  restartHomebridge() {
    this.$router.navigate(['/restart']);
    this.activeModal.close();
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

import { ApiService } from '@/app/core/api.service'
import { SettingsService } from '@/app/core/settings.service'
import { Component } from '@angular/core'
import { Router } from '@angular/router'
import { ToastrService } from 'ngx-toastr'

@Component({
  templateUrl: './power-options.component.html',
})
export class PowerOptionsComponent {
  constructor(
    private $api: ApiService,
    private $router: Router,
    public $settings: SettingsService,
    public $toastr: ToastrService,
  ) {}

  restartHomebridge() {
    this.$router.navigate(['/restart'])
  }

  restartHomebridgeService() {
    this.$api.put('/platform-tools/hb-service/set-full-service-restart-flag', {}).subscribe(
      () => {
        this.$router.navigate(['/restart'])
      },
      (err) => {
        this.$toastr.error(err.message, 'Failed to set force service restart flag.')
      },
    )
  }

  restartServer() {
    this.$router.navigate(['/platform-tools/linux/restart-server'])
  }

  shutdownServer() {
    this.$router.navigate(['/platform-tools/linux/shutdown-server'])
  }

  dockerStartupScript() {
    this.$router.navigate(['/platform-tools/docker/startup-script'])
  }

  dockerRestartContainer() {
    this.$router.navigate(['/platform-tools/docker/restart-container'])
  }
}

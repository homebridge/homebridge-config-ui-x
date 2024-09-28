import { ApiService } from '@/app/core/api.service'
import { SettingsService } from '@/app/core/settings.service'
import { Component } from '@angular/core'
import { Router } from '@angular/router'
import { TranslateService } from '@ngx-translate/core'
import { ToastrService } from 'ngx-toastr'

@Component({
  templateUrl: './power-options.component.html',
})
export class PowerOptionsComponent {
  constructor(
    private $api: ApiService,
    private $router: Router,
    public $settings: SettingsService,
    private $toastr: ToastrService,
    private $translate: TranslateService,
  ) {}

  restartHomebridge() {
    this.$router.navigate(['/restart'])
  }

  restartHomebridgeService() {
    this.$api.put('/platform-tools/hb-service/set-full-service-restart-flag', {}).subscribe({
      next: () => {
        this.$router.navigate(['/restart'])
      },
      error: (error) => {
        console.error(error)
        this.$toastr.error(error.message, this.$translate.instant('toast.title_error'))
      },
    })
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

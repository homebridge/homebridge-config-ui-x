import { ApiService } from '@/app/core/api.service'
import { SettingsService } from '@/app/core/settings.service'
import { Component, inject } from '@angular/core'
import { Router } from '@angular/router'
import { NgbTooltip } from '@ng-bootstrap/ng-bootstrap'
import { TranslatePipe, TranslateService } from '@ngx-translate/core'
import { ToastrService } from 'ngx-toastr'

@Component({
  templateUrl: './power-options.component.html',
  imports: [
    NgbTooltip,
    TranslatePipe,
  ],
})
export class PowerOptionsComponent {
  private $api = inject(ApiService)
  private $router = inject(Router)
  $settings = inject(SettingsService)
  private $toastr = inject(ToastrService)
  private $translate = inject(TranslateService)

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

  dockerRestartContainer() {
    this.$router.navigate(['/platform-tools/docker/restart-container'])
  }
}

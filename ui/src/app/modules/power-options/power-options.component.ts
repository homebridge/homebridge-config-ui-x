import { Component, inject, OnInit } from '@angular/core'
import { Router } from '@angular/router'
import { NgbModal, NgbTooltip } from '@ng-bootstrap/ng-bootstrap'
import { TranslatePipe, TranslateService } from '@ngx-translate/core'
import { ToastrService } from 'ngx-toastr'

import { ApiService } from '@/app/core/api.service'
import { ConfirmComponent } from '@/app/core/components/confirm/confirm.component'
import { SettingsService } from '@/app/core/settings.service'

@Component({
  templateUrl: './power-options.component.html',
  standalone: true,
  imports: [
    NgbTooltip,
    TranslatePipe,
  ],
})
export class PowerOptionsComponent implements OnInit {
  private $api = inject(ApiService)
  private $modal = inject(NgbModal)
  private $router = inject(Router)
  private $settings = inject(SettingsService)
  private $toastr = inject(ToastrService)
  private $translate = inject(TranslateService)

  public canShutdownRestartHost = this.$settings.env.canShutdownRestartHost
  public runningInDocker = this.$settings.env.runningInDocker

  public ngOnInit() {
    // Set page title
    const title = this.$translate.instant('menu.restart.title')
    this.$settings.setPageTitle(title)
  }

  public restartHomebridge() {
    void this.$router.navigate(['/restart'])
  }

  public restartHomebridgeService() {
    this.$api.put('/platform-tools/hb-service/set-full-service-restart-flag', {}).subscribe({
      next: () => {
        void this.$router.navigate(['/restart'])
      },
      error: (error) => {
        console.error(error)
        this.$toastr.error(error.message, this.$translate.instant('toast.title_error'))
      },
    })
  }

  public restartServer() {
    void this.$router.navigate(['/platform-tools/linux/restart-server'])
  }

  public shutdownServer() {
    // Confirmation dialog
    const ref = this.$modal.open(ConfirmComponent, {
      size: 'lg',
      backdrop: 'static',
    })
    ref.componentInstance.title = this.$translate.instant('menu.linux.label_shutdown_server')
    ref.componentInstance.message = this.$translate.instant('menu.linux.label_shutdown_modal')
    ref.componentInstance.confirmButtonLabel = this.$translate.instant('form.button_continue')
    ref.componentInstance.faIconClass = 'fa fa-power-off primary-text'

    ref.result
      .then(() => {
        void this.$router.navigate(['/platform-tools/linux/shutdown-server'])
      })
      .catch(() => { /* do nothing */ })
  }

  public dockerRestartContainer() {
    void this.$router.navigate(['/platform-tools/docker/restart-container'])
  }
}

import { ChangeDetectionStrategy, Component, createEnvironmentInjector, EnvironmentInjector, inject, OnInit, signal } from '@angular/core'
import { Router } from '@angular/router'
import { NgbModal } from '@ng-bootstrap/ng-bootstrap/modal'
import { NgbTooltip } from '@ng-bootstrap/ng-bootstrap/tooltip'
import { TranslatePipe, TranslateService } from '@ngx-translate/core'
import { ToastrService } from 'ngx-toastr'

import { ApiService } from '@/app/core/communication/api.service'
import { ConfirmComponent } from '@/app/core/components/confirm/confirm.component'
import { CONFIRM_MODAL_DATA } from '@/app/core/modal-data-tokens'
import { SettingsService } from '@/app/core/ui/settings.service'

@Component({
  selector: 'app-power-options',
  imports: [
    NgbTooltip,
    TranslatePipe,
  ],
  standalone: true,
  templateUrl: './power-options.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PowerOptionsComponent implements OnInit {
  private injector = inject(EnvironmentInjector)
  private $api = inject(ApiService)
  private $modal = inject(NgbModal)
  private $router = inject(Router)
  private $settings = inject(SettingsService)
  private $toastr = inject(ToastrService)
  private $translate = inject(TranslateService)

  // Signals
  public readonly canShutdownRestartHost = signal(this.$settings.env.canShutdownRestartHost)
  public readonly runningInDocker = signal(this.$settings.env.runningInDocker)

  public ngOnInit() {
    // Set page title
    const title = this.$translate.instant('menu.restart.title')
    this.$settings.setPageTitle(title)
  }

  private closeRestartToast() {
    if (this.$settings.restartToastRef) {
      this.$toastr.clear(this.$settings.restartToastRef.toastId)
      this.$settings.restartToastRef = null
    }
  }

  public restartHomebridge() {
    this.closeRestartToast()
    void this.$router.navigate(['/restart'])
  }

  public async restartHomebridgeService(): Promise<void> {
    this.closeRestartToast()
    try {
      await this.$api.put('/platform-tools/hb-service/set-full-service-restart-flag', {})
      void this.$router.navigate(['/restart'])
    } catch (error: any) {
      console.error(error)
      this.$toastr.error(error.message, this.$translate.instant('toast.title_error'))
    }
  }

  public restartServer() {
    this.closeRestartToast()
    void this.$router.navigate(['/platform-tools/linux/restart-server'])
  }

  public async shutdownServer(): Promise<void> {
    this.closeRestartToast()
    // Confirmation dialog
    const injector = createEnvironmentInjector([{
      provide: CONFIRM_MODAL_DATA,
      useValue: {
        title: this.$translate.instant('menu.linux.label_shutdown_server'),
        message: this.$translate.instant('menu.linux.label_shutdown_modal'),
        confirmButtonLabel: this.$translate.instant('form.button_continue'),
        faIconClass: 'fa fa-power-off primary-text',
      },
    }], this.injector)

    const ref = this.$modal.open(ConfirmComponent, {
      size: 'lg',
      backdrop: 'static',
      injector,
    })

    try {
      await ref.result
      void this.$router.navigate(['/platform-tools/linux/shutdown-server'])
    } catch {
      // Modal dismissed, do nothing
    }
  }

  public dockerRestartContainer() {
    this.closeRestartToast()
    void this.$router.navigate(['/platform-tools/docker/restart-container'])
  }
}

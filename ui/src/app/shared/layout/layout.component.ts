import { ChangeDetectionStrategy, Component, createEnvironmentInjector, EnvironmentInjector, inject, OnDestroy, OnInit, signal } from '@angular/core'
import { Router, RouterOutlet } from '@angular/router'
import { NgbModal } from '@ng-bootstrap/ng-bootstrap/modal'
import { TranslateService } from '@ngx-translate/core'
import { firstValueFrom } from 'rxjs'
import { lt } from 'semver'

import { AuthService } from '@/app/core/auth/auth.service'
import { IoNamespace, WsService } from '@/app/core/communication/ws.service'
import { ConfirmComponent } from '@/app/core/components/confirm/confirm.component'
import { CONFIRM_MODAL_DATA } from '@/app/core/modal-data-tokens'
import { SettingsService } from '@/app/core/ui/settings.service'
import { SidebarComponent } from '@/app/shared/layout/sidebar/sidebar.component'
import { environment } from '@/environments/environment'

@Component({
  selector: 'app-layout',
  imports: [
    SidebarComponent,
    RouterOutlet,
  ],
  standalone: true,
  templateUrl: './layout.component.html',
  styleUrl: './layout.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LayoutComponent implements OnInit, OnDestroy {
  // Injected dependencies
  private injector = inject(EnvironmentInjector)
  private $auth = inject(AuthService)
  private $modal = inject(NgbModal)
  private $router = inject(Router)
  private $settings = inject(SettingsService)
  private $translate = inject(TranslateService)
  private $ws = inject(WsService)

  // Other properties
  private io!: IoNamespace

  // Signals
  public readonly sidebarExpanded = signal(false)

  public ngOnInit(): void {
    this.io = this.$ws.connectToNamespace('app')
    this.io.socket.on('reconnect', () => {
      void this.$auth.checkToken()
    })

    void this.compareServerUiVersion()
  }

  public ngOnDestroy(): void {
    // Detach the reconnect handler and tear down the cached `app`
    // namespace socket. Without this, logout-then-login would mount a
    // fresh LayoutComponent that registers a second reconnect listener
    // on top of the old one, so a single reconnect would fire
    // `checkToken` twice. Same hazard for navigation patterns that
    // remount the layout (some routes lazy-load and detach the shell).
    this.io?.socket?.removeAllListeners('reconnect')
    this.io?.end?.()
  }

  private async compareServerUiVersion(): Promise<void> {
    if (!this.$settings.settingsLoaded) {
      await firstValueFrom(this.$settings.onSettingsLoaded)
    }

    if (!this.$router.url.endsWith('/restart') && lt(this.$settings.uiVersion, environment.serverTarget)) {
      // eslint-disable-next-line no-console
      console.log(`Server restart required. UI Version: ${environment.serverTarget} - Server Version: ${this.$settings.uiVersion} `)
      const injector = createEnvironmentInjector([{
        provide: CONFIRM_MODAL_DATA,
        useValue: {
          title: this.$translate.instant('platform.version.service_restart_required'),
          message: this.$translate.instant('platform.version.restart_required', {
            serverVersion: this.$settings.uiVersion,
            uiVersion: environment.serverTarget,
          }),
          confirmButtonLabel: this.$translate.instant('menu.tooltip_restart'),
          faIconClass: 'fas fa-power-off orange-text',
        },
      }], this.injector)

      const ref = this.$modal.open(ConfirmComponent, {
        size: 'lg',
        backdrop: 'static',
        // Block ESC. This is the "server restart required" modal — letting
        // it dismiss silently leaves the user looking at a half-broken UI
        // that the version-mismatch path was about to walk them through.
        keyboard: false,
        injector,
      })

      try {
        await ref.result
        void this.$router.navigate(['/restart'])
      } catch {
        // Modal dismissed, do nothing
      }
    }
  }
}

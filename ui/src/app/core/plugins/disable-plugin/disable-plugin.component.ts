import { ChangeDetectionStrategy, Component, inject } from '@angular/core'
import { NgbAlert } from '@ng-bootstrap/ng-bootstrap/alert'
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap/modal'
import { TranslatePipe, TranslateService } from '@ngx-translate/core'

import { DISABLE_PLUGIN_MODAL_DATA } from '@/app/core/modal-data-tokens'

@Component({
  imports: [
    NgbAlert,
    TranslatePipe,
  ],
  standalone: true,
  templateUrl: './disable-plugin.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DisablePluginComponent {
  // Injected dependencies
  private $activeModal = inject(NgbActiveModal)
  private $translate = inject(TranslateService)
  private modalData = inject(DISABLE_PLUGIN_MODAL_DATA)

  // Public properties (from injected data)
  public pluginName = this.modalData.pluginName
  public isConfigured = this.modalData.isConfigured ?? false
  public isConfiguredDynamicPlatform = this.modalData.isConfiguredDynamicPlatform ?? false
  public keepOrphans = this.modalData.keepOrphans ?? false

  // Other properties
  public readonly keepOrphansName = `<code>${this.$translate.instant('settings.startup.keep_accessories')}</code>`

  get keepOrphansValue(): string {
    return `<code>${this.keepOrphans}</code>`
  }

  // Public methods
  public dismissModal(): void {
    this.$activeModal.dismiss('Dismiss')
  }

  public closeModal(): void {
    this.$activeModal.close()
  }
}

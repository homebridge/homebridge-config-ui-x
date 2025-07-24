import { Component, inject, Input } from '@angular/core'
import { NgbActiveModal, NgbAlert } from '@ng-bootstrap/ng-bootstrap'
import { TranslatePipe, TranslateService } from '@ngx-translate/core'

@Component({
  templateUrl: './disable-plugin.component.html',
  standalone: true,
  imports: [
    NgbAlert,
    TranslatePipe,
  ],
})
export class DisablePluginComponent {
  private $activeModal = inject(NgbActiveModal)
  private $translate = inject(TranslateService)

  @Input() pluginName: string
  @Input() isConfigured = false
  @Input() isConfiguredDynamicPlatform = false
  @Input() keepOrphans = false

  public readonly keepOrphansName = `<code>${this.$translate.instant('settings.startup.keep_accessories')}</code>`
  public readonly keepOrphansValue = `<code>${this.keepOrphans}</code>`

  public dismissModal() {
    this.$activeModal.dismiss('Dismiss')
  }

  public closeModal() {
    this.$activeModal.close()
  }
}

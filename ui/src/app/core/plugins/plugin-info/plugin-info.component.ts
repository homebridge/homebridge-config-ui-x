import { Component, computed, inject, signal } from '@angular/core'
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap/modal'
import { TranslatePipe } from '@ngx-translate/core'

import { PLUGIN_MODAL_DATA } from '@/app/core/modal-data-tokens'

@Component({
  templateUrl: './plugin-info.component.html',
  styleUrls: ['./plugin-info.component.scss'],
  standalone: true,
  imports: [TranslatePipe],
})
export class PluginInfoComponent {
  // Injected dependencies
  private $activeModal = inject(NgbActiveModal)
  private modalData = inject(PLUGIN_MODAL_DATA)

  // Public properties for component use
  public plugin = this.modalData.plugin

  // Signals
  private iconError = signal(false)
  public pluginIcon = computed(() => {
    return (this.plugin?.icon && !this.iconError()) ? this.plugin.icon : this.defaultIcon
  })

  // Other properties
  public readonly defaultIcon = 'assets/hb-icon.png'
  public readonly linkScoped = '<a href="https://github.com/homebridge/plugins/wiki/Scoped-Plugins" target="_blank"><i class="fas fa-external-link-alt primary-text"></i></a>'
  public readonly linkVerified = '<a href="https://github.com/homebridge/plugins/wiki/Verified-Plugins" target="_blank"><i class="fas fa-external-link-alt primary-text"></i></a>'

  // Public methods
  public handleIconError(): void {
    this.iconError.set(true)
  }

  public dismissModal(): void {
    this.$activeModal.dismiss('Dismiss')
  }
}

import { ChangeDetectionStrategy, Component, inject, OnInit, signal } from '@angular/core'
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap/modal'
import { TranslatePipe } from '@ngx-translate/core'

import { PLUGIN_MODAL_DATA } from '@/app/core/modal-data-tokens'
import { PluginFundingOption } from '@/app/core/plugins/manage-plugins.interfaces'

@Component({
  imports: [
    TranslatePipe,
  ],
  standalone: true,
  templateUrl: './donate.component.html',
  styleUrl: './donate.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DonateComponent implements OnInit {
  // Injected dependencies
  private $activeModal = inject(NgbActiveModal)
  private modalData = inject(PLUGIN_MODAL_DATA)

  // Public properties for component use
  public plugin = this.modalData.plugin

  // Signals
  public readonly fundingOptions = signal<PluginFundingOption[]>([])
  public readonly authorName = signal<string>('')

  public ngOnInit(): void {
    void this.initialize()
  }

  private initialize(): void {
    if (!this.plugin || !this.plugin.funding) {
      this.$activeModal.close()
      return
    }

    // Override author for homebridge-config-ui-x
    this.authorName.set(this.plugin.name === 'homebridge-config-ui-x' ? 'oznu' : this.plugin.author)

    // Normalize the different funding attribute formats
    const funding = this.plugin.funding
    if (Array.isArray(funding)) {
      // eslint-disable-next-line array-callback-return
      const options = funding.map((option: PluginFundingOption | string) => {
        if (typeof option === 'string') {
          return {
            type: 'other',
            url: option,
          }
        } else if (typeof option === 'object') {
          return {
            type: option.type || 'other',
            url: option.url,
          }
        }
      }).filter(Boolean) as PluginFundingOption[]
      this.fundingOptions.set(options)
    } else if (typeof funding === 'string') {
      this.fundingOptions.set([
        {
          type: 'other',
          url: funding,
        },
      ])
    } else if (typeof funding === 'object' && funding !== null) {
      this.fundingOptions.set([
        {
          type: funding.type || 'other',
          url: funding.url,
        },
      ])
    }
  }

  public getIconClass(type: string) {
    switch (type.toLowerCase()) {
      case 'paypal':
        return 'fab fa-paypal'
      case 'github':
        return 'fab fa-github'
      case 'patreon':
        return 'fab fa-patreon'
      case 'kofi':
      case 'ko-fi':
        return 'fab fa-ko-fi'
      default:
        return 'fas fa-link'
    }
  }

  public dismissModal() {
    this.$activeModal.dismiss('Dismiss')
  }
}

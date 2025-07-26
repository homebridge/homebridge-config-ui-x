import { NgClass } from '@angular/common'
import { Component, inject, Input, OnInit } from '@angular/core'
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap'
import { TranslatePipe } from '@ngx-translate/core'

import { Plugin, PluginFundingOption } from '@/app/core/manage-plugins/manage-plugins.interfaces'

@Component({
  templateUrl: './donate.component.html',
  styleUrls: ['./donate.component.scss'],
  standalone: true,
  imports: [
    NgClass,
    TranslatePipe,
  ],
})
export class DonateComponent implements OnInit {
  private $activeModal = inject(NgbActiveModal)

  @Input() plugin: Plugin

  public fundingOptions: PluginFundingOption[]

  public ngOnInit(): void {
    if (!this.plugin.funding) {
      this.$activeModal.close()
    }

    // Override author for homebridge-config-ui-x
    if (this.plugin.name === 'homebridge-config-ui-x') {
      this.plugin.author = 'oznu'
    }

    // Normalise the different funding attribute formats
    if (Array.isArray(this.plugin.funding)) {
      // eslint-disable-next-line array-callback-return
      this.fundingOptions = this.plugin.funding.map((option: any) => {
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
      })
    } else if (typeof this.plugin.funding === 'string') {
      this.fundingOptions = [
        {
          type: 'other',
          url: this.plugin.funding,
        },
      ]
    } else if (typeof this.plugin.funding === 'object') {
      this.fundingOptions = [
        {
          type: this.plugin.funding.type || 'other',
          url: this.plugin.funding.url,
        },
      ]
    }
  }

  public getIconClass(type: string) {
    switch (type.toLowerCase()) {
      case 'paypal':
        return 'fab fa-fw fa-paypal'
      case 'github':
        return 'fab fa-fw fa-github'
      case 'patreon':
        return 'fab fa-fw fa-patreon'
      case 'kofi':
      case 'ko-fi':
        return 'fas fa-fw fa-coffee'
      default:
        return 'fas fa-fw fa-link'
    }
  }

  public dismissModal() {
    this.$activeModal.dismiss('Dismiss')
  }
}

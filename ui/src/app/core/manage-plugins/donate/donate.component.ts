import { Component, Input, OnInit } from '@angular/core'
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap'

@Component({
  templateUrl: './donate.component.html',
  styleUrls: ['./donate.component.scss'],
})
export class DonateComponent implements OnInit {
  @Input() plugin: any

  public fundingOptions: { type: string, url: string }[]

  constructor(
    public activeModal: NgbActiveModal,
  ) {}

  ngOnInit(): void {
    if (!this.plugin.funding) {
      this.activeModal.close()
    }

    // Override author for homebridge-config-ui-x
    if (this.plugin.name === 'homebridge-config-ui-x') {
      this.plugin.author = 'oznu'
    }

    // normalise the different funding attribute formats
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

  getIconClass(type: string) {
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
}

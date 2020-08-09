import { Component, OnInit, Input } from '@angular/core';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';

@Component({
  selector: 'app-donate-modal',
  templateUrl: './donate-modal.component.html',
  styleUrls: ['./donate-modal.component.scss'],
})
export class DonateModalComponent implements OnInit {
  @Input() plugin;

  public fundingOptions: { type: string, url: string }[];

  constructor(
    public activeModal: NgbActiveModal,
  ) { }

  ngOnInit(): void {
    if (!this.plugin.funding) {
      this.activeModal.close();
    }

    // normalise the different funding attribute formats
    if (Array.isArray(this.plugin.funding)) {
      this.fundingOptions = this.plugin.funding.map((option) => {
        if (typeof option === 'string') {
          return {
            type: 'other',
            url: option,
          };
        } else if (typeof option === 'object') {
          return {
            type: option.type || 'other',
            url: option.url,
          };
        }
      });
    } else if (typeof this.plugin.funding === 'string') {
      this.fundingOptions = [
        {
          type: 'other',
          url: this.plugin.funding,
        },
      ];
    } else if (typeof this.plugin.funding === 'object') {
      this.fundingOptions = [
        {
          type: this.plugin.funding.type || 'other',
          url: this.plugin.funding.url,
        },
      ];
    }
  }

  getIconClass(type: string) {
    switch (type.toLowerCase()) {
      case 'paypal':
        return 'fab fa-paypal';
      case 'github':
        return 'fab fa-github';
      case 'patreon':
        return 'fab fa-patreon';
      case 'kofi':
      case 'ko-fi':
        return 'fas fa-coffee';
      default:
        return 'fas fa-link';
    }
  }

}

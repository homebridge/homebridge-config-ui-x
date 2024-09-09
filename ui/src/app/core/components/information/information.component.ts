import { Component, Input } from '@angular/core'
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap'

@Component({
  templateUrl: './information.component.html',
})
export class InformationComponent {
  @Input() title: string
  @Input() subtitle: string | null
  @Input() message: string
  @Input() ctaButtonLabel: string
  @Input() ctaButtonLink: string
  @Input() faIconClass: string

  constructor(
    public activeModal: NgbActiveModal,
  ) {}
}

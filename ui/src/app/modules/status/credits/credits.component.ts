import { Component, inject } from '@angular/core'
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap'
import { TranslatePipe } from '@ngx-translate/core'

@Component({
  templateUrl: './credits.component.html',
  imports: [TranslatePipe],
})
export class CreditsComponent {
  $activeModal = inject(NgbActiveModal)
}

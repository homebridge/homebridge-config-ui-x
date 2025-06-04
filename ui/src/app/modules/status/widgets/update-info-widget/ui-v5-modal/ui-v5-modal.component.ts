import { NgOptimizedImage } from '@angular/common'
import { Component, inject, Input } from '@angular/core'
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap'
import { TranslatePipe } from '@ngx-translate/core'

import { SettingsService } from '@/app/core/settings.service'

@Component({
  templateUrl: './ui-v5-modal.component.html',
  standalone: true,
  imports: [
    TranslatePipe,
    NgOptimizedImage,
  ],
})
export class UiV5ModalComponent {
  $activeModal = inject(NgbActiveModal)
  $settings = inject(SettingsService)

  @Input() readyForV5: {
    node: boolean
    pnpm: boolean
    service: boolean
    arch: boolean
  }

  constructor() {}
}

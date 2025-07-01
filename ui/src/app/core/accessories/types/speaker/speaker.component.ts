import { NgClass } from '@angular/common'
import { Component, inject, Input } from '@angular/core'
import { NgbModal } from '@ng-bootstrap/ng-bootstrap'
import { TranslatePipe } from '@ngx-translate/core'
import { InlineSVGModule } from 'ng-inline-svg-2'

import { ServiceTypeX } from '@/app/core/accessories/accessories.interfaces'
import { SpeakerManageComponent } from '@/app/core/accessories/types/speaker/speaker.manage.component'
import { LongClickDirective } from '@/app/core/directives/longclick.directive'

@Component({
  selector: 'app-speaker',
  templateUrl: './speaker.component.html',
  standalone: true,
  imports: [
    LongClickDirective,
    NgClass,
    InlineSVGModule,
    TranslatePipe,
  ],
})
export class SpeakerComponent {
  private $modal = inject(NgbModal)

  @Input() public service: ServiceTypeX

  constructor() {}

  onClick() {
    const active = this.service.getCharacteristic('Active')
    if (active !== undefined) {
      active.setValue(this.service.values.Active === 0 ? 1 : 0)
    } else {
      this.service.getCharacteristic('Mute').setValue(!this.service.values.Mute)
    }
  }

  onLongClick() {
    if ('Volume' in this.service.values || 'Active' in this.service.values) {
      const ref = this.$modal.open(SpeakerManageComponent, {
        size: 'md',
        backdrop: 'static',
      })
      ref.componentInstance.service = this.service
    }
  }
}

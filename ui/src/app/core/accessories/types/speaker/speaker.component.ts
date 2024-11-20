import { ServiceTypeX } from '@/app/core/accessories/accessories.interfaces'
import { SpeakerManageComponent } from '@/app/core/accessories/types/speaker/speaker.manage.component'
import { NgClass } from '@angular/common'
import { Component, inject, Input } from '@angular/core'
import { NgbModal } from '@ng-bootstrap/ng-bootstrap'
import { TranslatePipe } from '@ngx-translate/core'
import { InlineSVGModule } from 'ng-inline-svg-2'
import { LongClickDirective } from '../../../directives/longclick.directive'

@Component({
  selector: 'app-speaker',
  templateUrl: './speaker.component.html',
  styleUrls: ['./speaker.component.scss'],
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

  onClick() {
    this.service.getCharacteristic('Mute').setValue(!this.service.values.Mute)
  }

  onLongClick() {
    if ('Volume' in this.service.values) {
      const ref = this.$modal.open(SpeakerManageComponent, {
        size: 'sm',
      })
      ref.componentInstance.service = this.service
    }
  }
}

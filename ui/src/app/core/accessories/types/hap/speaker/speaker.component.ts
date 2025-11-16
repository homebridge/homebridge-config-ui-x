import { NgClass } from '@angular/common'
import { Component, inject, Input } from '@angular/core'
import { NgbModal } from '@ng-bootstrap/ng-bootstrap'
import { TranslatePipe } from '@ngx-translate/core'

import { ServiceTypeX } from '@/app/core/accessories/accessories.interfaces'
import { AccessoriesService } from '@/app/core/accessories/accessories.service'
import { SpeakerManageComponent } from '@/app/core/accessories/types/hap/speaker/speaker.manage.component'
import { LongClickDirective } from '@/app/core/directives/long-click.directive'

@Component({
  selector: 'app-speaker',
  templateUrl: './speaker.component.html',
  styleUrls: ['./speaker.component.scss'],
  standalone: true,
  imports: [
    LongClickDirective,
    NgClass,
    TranslatePipe,
  ],
})
export class SpeakerComponent {
  private $accessories = inject(AccessoriesService)
  private $modal = inject(NgbModal)

  @Input() public service: ServiceTypeX
  @Input() public readyForControl = false

  public onClick() {
    if (!this.readyForControl) {
      return
    }

    if ('Active' in this.service.values) {
      this.service.getCharacteristic('Active').setValue(this.service.values.Active === 0 ? 1 : 0)
    } else if ('TargetMediaState' in this.service.values) {
      this.service.getCharacteristic('TargetMediaState').setValue(this.service.values.TargetMediaState === 0 ? 1 : 0)
    } else if ('Mute' in this.service.values) {
      this.service.getCharacteristic('Mute').setValue(!this.service.values.Mute)
    }
  }

  public onLongClick() {
    if (!this.readyForControl) {
      return
    }

    if ('Active' in this.service.values || 'TargetMediaState' in this.service.values || 'Volume' in this.service.values || 'Mute' in this.service.values) {
      const ref = this.$modal.open(SpeakerManageComponent, {
        size: 'md',
        backdrop: 'static',
      })
      ref.componentInstance.service = this.service
      ref.componentInstance.$accessories = this.$accessories
    }
  }
}

import { ServiceTypeX } from '@/app/core/accessories/accessories.interfaces'
import { LightbulbManageComponent } from '@/app/core/accessories/types//lightbulb/lightbulb.manage.component'
import { NgClass } from '@angular/common'
import { Component, inject, Input } from '@angular/core'
import { NgbModal } from '@ng-bootstrap/ng-bootstrap'
import { TranslatePipe } from '@ngx-translate/core'
import { InlineSVGModule } from 'ng-inline-svg-2'
import { LongClickDirective } from '../../../directives/longclick.directive'

@Component({
  selector: 'app-lightbulb',
  templateUrl: './lightbulb.component.html',
  styleUrls: ['./lightbulb.component.scss'],
  imports: [
    LongClickDirective,
    NgClass,
    InlineSVGModule,
    TranslatePipe,
  ],
})
export class LightbulbComponent {
  private $modal = inject(NgbModal)

  @Input() public service: ServiceTypeX

  onClick() {
    this.service.getCharacteristic('On').setValue(!this.service.values.On)

    // set the brightness to 100% if on 0% when turned on
    if (!this.service.values.On && 'Brightness' in this.service.values && !this.service.values.Brightness) {
      this.service.getCharacteristic('Brightness').setValue(100)
    }
  }

  onLongClick() {
    if ('Brightness' in this.service.values) {
      const ref = this.$modal.open(LightbulbManageComponent, {
        size: 'md',
      })
      ref.componentInstance.service = this.service
    }
  }
}

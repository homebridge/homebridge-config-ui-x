import { NgClass } from '@angular/common'
import { Component, inject, Input, OnInit } from '@angular/core'
import { NgbModal } from '@ng-bootstrap/ng-bootstrap'
import { TranslatePipe } from '@ngx-translate/core'
import { InlineSVGModule } from 'ng-inline-svg-2'

import { ServiceTypeX } from '@/app/core/accessories/accessories.interfaces'
import { TelevisionManageComponent } from '@/app/core/accessories/types/television/television.manage.component'
import { LongClickDirective } from '@/app/core/directives/longclick.directive'

@Component({
  selector: 'app-television',
  templateUrl: './television.component.html',
  standalone: true,
  imports: [
    LongClickDirective,
    NgClass,
    InlineSVGModule,
    TranslatePipe,
  ],
})
export class TelevisionComponent implements OnInit {
  private $modal = inject(NgbModal)

  @Input() public service: ServiceTypeX
  public channelList: Record<number, string> = {}

  constructor() {}

  ngOnInit() {
    // Build inputService list
    for (const [, inputService] of Object.entries(this.service.linkedServices)) {
      if (inputService.type === 'InputSource') {
        this.channelList[inputService.values.Identifier] = inputService.values.ConfiguredName || `Input ${inputService.values.Identifier}`
      }
    }
  }

  onClick() {
    this.service.getCharacteristic('Active').setValue(this.service.values.Active ? 0 : 1)
  }

  onLongClick() {
    if ('Active' in this.service.values || Object.keys(this.channelList).length) {
      const ref = this.$modal.open(TelevisionManageComponent, {
        size: 'md',
        backdrop: 'static',
      })
      ref.componentInstance.service = this.service
      ref.componentInstance.inputList = this.channelList
    }
  }
}

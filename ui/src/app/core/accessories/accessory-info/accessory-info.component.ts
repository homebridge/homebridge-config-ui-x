import { ServiceTypeX } from '@/app/core/accessories/accessories.interfaces'
import { ConvertTempPipe } from '@/app/core/pipes/convert-temp.pipe'
import { Component, inject, Input, OnInit } from '@angular/core'
import { FormsModule } from '@angular/forms'

import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap'
import { TranslatePipe } from '@ngx-translate/core'

@Component({
  templateUrl: './accessory-info.component.html',
  imports: [
    FormsModule,
    TranslatePipe,
    ConvertTempPipe,
  ],
})
export class AccessoryInfoComponent implements OnInit {
  $activeModal = inject(NgbActiveModal)

  @Input() public service: ServiceTypeX
  public accessoryInformation: Array<any>

  ngOnInit() {
    this.accessoryInformation = Object.entries(this.service.accessoryInformation).map(([key, value]) => ({ key, value }))
  }
}

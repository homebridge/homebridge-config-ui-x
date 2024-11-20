import { ServiceTypeX } from '@/app/core/accessories/accessories.interfaces'
import { NgClass } from '@angular/common'
import { Component, Input } from '@angular/core'
import { TranslatePipe } from '@ngx-translate/core'
import { InlineSVGModule } from 'ng-inline-svg-2'

@Component({
  selector: 'app-carbondioxidesensor',
  templateUrl: './carbondioxidesensor.component.html',
  styleUrls: ['./carbondioxidesensor.component.scss'],
  imports: [
    NgClass,
    InlineSVGModule,
    TranslatePipe,
  ],
})
export class CarbondioxidesensorComponent {
  @Input() public service: ServiceTypeX

  constructor() {}
}

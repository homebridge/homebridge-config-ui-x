import { ServiceTypeX } from '@/app/core/accessories/accessories.interfaces'
import { NgClass } from '@angular/common'
import { Component, Input } from '@angular/core'
import { TranslatePipe } from '@ngx-translate/core'
import { InlineSVGModule } from 'ng-inline-svg-2'

@Component({
  selector: 'app-carbonmonoxidesensor',
  templateUrl: './carbonmonoxidesensor.component.html',
  styleUrls: ['./carbonmonoxidesensor.component.scss'],
  imports: [
    NgClass,
    InlineSVGModule,
    TranslatePipe,
  ],
})
export class CarbonmonoxidesensorComponent {
  @Input() public service: ServiceTypeX

  constructor() {}
}

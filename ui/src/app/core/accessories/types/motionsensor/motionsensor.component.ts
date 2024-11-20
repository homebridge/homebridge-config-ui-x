import { ServiceTypeX } from '@/app/core/accessories/accessories.interfaces'
import { NgClass } from '@angular/common'
import { Component, Input } from '@angular/core'
import { TranslatePipe } from '@ngx-translate/core'
import { InlineSVGModule } from 'ng-inline-svg-2'

@Component({
  selector: 'app-motionsensor',
  templateUrl: './motionsensor.component.html',
  styleUrls: ['./motionsensor.component.scss'],
  imports: [
    NgClass,
    InlineSVGModule,
    TranslatePipe,
  ],
})
export class MotionsensorComponent {
  @Input() public service: ServiceTypeX

  constructor() {}
}

import { NgClass } from '@angular/common'
import { Component, Input } from '@angular/core'
import { TranslatePipe } from '@ngx-translate/core'

import { ServiceTypeX } from '@/app/core/accessories/accessories.interfaces'

@Component({
  selector: 'app-stateless-programmable-switch',
  templateUrl: './stateless-programmable-switch.component.html',
  styleUrls: ['./stateless-programmable-switch.component.scss'],
  standalone: true,
  imports: [NgClass, TranslatePipe],
})
export class StatelessProgrammableSwitchComponent {
  @Input() public service: ServiceTypeX
}

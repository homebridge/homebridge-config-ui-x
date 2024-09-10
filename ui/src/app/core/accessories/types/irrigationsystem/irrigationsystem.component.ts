import { ServiceTypeX } from '@/app/core/accessories/accessories.interfaces'
import { Component, Input } from '@angular/core'

@Component({
  selector: 'app-irrigationsystem',
  templateUrl: './irrigationsystem.component.html',
  styleUrls: ['./irrigationsystem.component.scss'],
})
export class IrrigationSystemComponent {
  @Input() public service: ServiceTypeX
}

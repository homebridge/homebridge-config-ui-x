import { Component, Input } from '@angular/core';
import { ServiceTypeX } from '../../accessories.interfaces';

@Component({
  selector: 'app-irrigationsystem',
  templateUrl: './irrigationsystem.component.html',
  styleUrls: ['./irrigationsystem.component.scss'],
})
export class IrrigationSystemComponent {
  @Input() public service: ServiceTypeX;
}

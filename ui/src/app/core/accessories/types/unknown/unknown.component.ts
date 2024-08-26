import { Component, Input } from '@angular/core';
import { ServiceTypeX } from '@/app/core/accessories/accessories.interfaces';

@Component({
  selector: 'app-unknown',
  templateUrl: './unknown.component.html',
  styleUrls: ['./unknown.component.scss'],
})
export class UnknownComponent {
  @Input() public service: ServiceTypeX;

  constructor() {}
}

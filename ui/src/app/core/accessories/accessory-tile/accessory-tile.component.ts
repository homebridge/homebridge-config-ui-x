import { Component, Input } from '@angular/core';
import { ServiceTypeX } from '../accessories.interfaces';
import { AccessoriesService } from '../accessories.service';

@Component({
  selector: 'app-accessory-tile',
  templateUrl: './accessory-tile.component.html',
  styleUrls: ['./accessory-tile.component.scss'],
})
export class AccessoryTileComponent {
  @Input() public service: ServiceTypeX;

  constructor(
    public $accessories: AccessoriesService,
  ) {}
}

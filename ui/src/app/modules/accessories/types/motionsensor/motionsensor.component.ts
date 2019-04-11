import { Component, OnInit, Input } from '@angular/core';
import { ServiceTypeX } from '../../accessories.component';

@Component({
  selector: 'app-motionsensor',
  templateUrl: './motionsensor.component.html',
  styleUrls: ['./motionsensor.component.scss'],
})
export class MotionsensorComponent implements OnInit {
  @Input() public service: ServiceTypeX;

  constructor() { }

  ngOnInit() {
  }

}

import { Component, OnInit, Input } from '@angular/core';

@Component({
  selector: 'app-motionsensor',
  templateUrl: './motionsensor.component.html',
  styleUrls: ['./motionsensor.component.scss']
})
export class MotionsensorComponent implements OnInit {
  @Input() public service: any;

  constructor() { }

  ngOnInit() {
  }

}

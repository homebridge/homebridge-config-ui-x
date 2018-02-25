import { Component, OnInit, Input } from '@angular/core';

@Component({
  selector: 'app-unknown',
  templateUrl: './unknown.component.html',
  styleUrls: ['./unknown.component.scss']
})
export class UnknownComponent implements OnInit {
  @Input() public service: any;

  constructor() { }

  ngOnInit() {
  }

}

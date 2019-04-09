import { Component, OnInit, Input } from '@angular/core';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { ServiceTypeX } from '../accessories.component';

@Component({
  selector: 'app-info-modal',
  templateUrl: './info-modal.component.html'
})
export class InfoModalComponent implements OnInit {
  @Input() public service: ServiceTypeX;
  public accessoryInformation: Array<any>;

  constructor(
    public activeModal: NgbActiveModal
  ) { }

  ngOnInit() {
    console.log(this.service);
    this.accessoryInformation = Object.entries(this.service.accessoryInformation).map(([key, value]) => {
      return { key, value };
    });
  }

}

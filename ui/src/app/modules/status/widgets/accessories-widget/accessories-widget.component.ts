import { Component, OnInit, OnDestroy } from '@angular/core';
import { AccessoriesService } from '../../../../core/accessories/accessories.service';

@Component({
  selector: 'app-accessories-widget',
  templateUrl: './accessories-widget.component.html',
  styleUrls: ['./accessories-widget.component.scss'],
})
export class AccessoriesWidgetComponent implements OnInit, OnDestroy {

  constructor(
    public $accessories: AccessoriesService,
  ) { }

  ngOnInit() {
    this.$accessories.start();
  }

  ngOnDestroy() {
    this.$accessories.stop();
  }

}

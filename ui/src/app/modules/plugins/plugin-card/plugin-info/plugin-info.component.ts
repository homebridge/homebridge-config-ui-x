import { Component, Input, OnInit } from '@angular/core'
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap'

@Component({
  templateUrl: './plugin-info.component.html',
  styleUrls: ['./plugin-info.component.scss'],
})
export class PluginInfoComponent implements OnInit {
  @Input() plugin: any

  public defaultIcon = 'assets/hb-icon.png'

  constructor(
    public activeModal: NgbActiveModal,
  ) {}

  ngOnInit() {
    if (!this.plugin.icon) {
      this.plugin.icon = this.defaultIcon
    }
  }

  handleIconError() {
    this.plugin.icon = this.defaultIcon
  }
}

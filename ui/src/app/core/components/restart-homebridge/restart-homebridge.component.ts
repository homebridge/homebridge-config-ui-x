import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';

@Component({
  selector: 'app-confirm',
  templateUrl: './restart-homebridge.component.html',
  styleUrls: ['./restart-homebridge.component.scss'],
})
export class RestartHomebridgeComponent {
  constructor(
    public activeModal: NgbActiveModal,
    private $router: Router,
  ) { }

  public onRestartHomebridgeClick() {
    this.$router.navigate(['/restart']);
    this.activeModal.close();
  }
}

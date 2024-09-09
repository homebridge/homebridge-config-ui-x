import { Component } from '@angular/core'
import { Router } from '@angular/router'
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap'

@Component({
  templateUrl: './restart.component.html',
})
export class RestartComponent {
  constructor(
    public activeModal: NgbActiveModal,
    private $router: Router,
  ) {}

  public onRestartHomebridgeClick() {
    this.$router.navigate(['/restart'])
    this.activeModal.close()
  }
}

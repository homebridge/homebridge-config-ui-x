import { Component, inject } from '@angular/core'
import { Router } from '@angular/router'
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap'
import { TranslatePipe } from '@ngx-translate/core'

@Component({
  templateUrl: './restart-homebridge.component.html',
  standalone: true,
  imports: [TranslatePipe],
})
export class RestartHomebridgeComponent {
  $activeModal = inject(NgbActiveModal)
  private $router = inject(Router)

  constructor() {}

  public onRestartHomebridgeClick() {
    this.$router.navigate(['/restart'])
    this.$activeModal.close()
  }
}

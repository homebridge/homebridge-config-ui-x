import { ChangeDetectionStrategy, Component, inject } from '@angular/core'
import { Router } from '@angular/router'
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap/modal'
import { TranslatePipe } from '@ngx-translate/core'

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './restart-homebridge.component.html',
  standalone: true,
  imports: [TranslatePipe],
})
export class RestartHomebridgeComponent {
  private $activeModal = inject(NgbActiveModal)
  private $router = inject(Router)

  public onRestartHomebridgeClick() {
    void this.$router.navigate(['/restart'])
    this.$activeModal.close()
  }

  public dismissModal() {
    this.$activeModal.dismiss('Dismiss')
  }
}

import { ChangeDetectionStrategy, Component, inject } from '@angular/core'
import { Router } from '@angular/router'
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap/modal'
import { TranslatePipe } from '@ngx-translate/core'

@Component({
  imports: [TranslatePipe],
  standalone: true,
  templateUrl: './restart-homebridge.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
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

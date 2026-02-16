import { ChangeDetectionStrategy, Component, inject } from '@angular/core'
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap/modal'
import { TranslatePipe } from '@ngx-translate/core'

@Component({
  selector: 'app-credits',
  imports: [TranslatePipe],
  standalone: true,
  templateUrl: './credits.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CreditsComponent {
  // Injected dependencies
  private $activeModal = inject(NgbActiveModal)

  public translators = [
    { language: 'Finnish', github: 'l1500s' },
    { language: 'Hebrew', github: 'seidnerj' },
    { language: 'Polish', github: 'mkz212' },
    { language: 'Thai', github: 'tomzt' },
    { language: 'Ukrainian', github: 'xrust83' },
    { language: 'Vietnam', github: 'khanhnd88' },
  ]

  public dismissModal(): void {
    this.$activeModal.dismiss('Dismiss')
  }
}

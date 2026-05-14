import { ChangeDetectionStrategy, Component, inject } from '@angular/core'
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap/modal'
import { TranslatePipe } from '@ngx-translate/core'

import { MarkdownComponent } from '@/app/core/components/markdown/markdown.component'
import { INFORMATION_MODAL_DATA } from '@/app/core/modal-data-tokens'

@Component({
  selector: 'app-information',
  imports: [
    TranslatePipe,
    MarkdownComponent,
  ],
  standalone: true,
  templateUrl: './information.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class InformationComponent {
  // Injected dependencies
  private $activeModal = inject(NgbActiveModal)
  private modalData = inject(INFORMATION_MODAL_DATA)

  // Public properties (from injected data)
  public title = this.modalData.title
  public subtitle = this.modalData.subtitle
  public message = this.modalData.message
  public ctaButtonLabel = this.modalData.ctaButtonLabel
  public ctaButtonLink = this.modalData.ctaButtonLink
  public faIconClass = this.modalData.faIconClass
  public markdownMessage2 = this.modalData.markdownMessage2

  // Public methods
  public dismissModal(): void {
    this.$activeModal.dismiss('Dismiss')
  }
}

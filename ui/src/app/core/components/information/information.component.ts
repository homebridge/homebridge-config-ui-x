import { Component, inject } from '@angular/core'
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap/modal'
import { TranslatePipe } from '@ngx-translate/core'
import { NgxMdModule } from 'ngx-md'

import { PluginsMarkdownDirective } from '@/app/core/directives/plugins.markdown.directive'
import { INFORMATION_MODAL_DATA } from '@/app/core/modal-data-tokens'

@Component({
  templateUrl: './information.component.html',
  styleUrls: ['./information.component.scss'],
  standalone: true,
  imports: [
    TranslatePipe,
    NgxMdModule,
    PluginsMarkdownDirective,
  ],
})
export class InformationComponent {
  // Injected dependencies
  private $activeModal = inject(NgbActiveModal)
  private modalData = inject(INFORMATION_MODAL_DATA)

  // Public properties (from injected data)
  public title = this.modalData.title
  public subtitle = this.modalData.subtitle
  public message = this.modalData.message
  public message2 = this.modalData.markdownMessage2
  public ctaButtonLabel = this.modalData.ctaButtonLabel
  public ctaButtonLink = this.modalData.ctaButtonLink
  public faIconClass = this.modalData.faIconClass
  public markdownMessage2 = this.modalData.markdownMessage2

  // Public methods
  public dismissModal(): void {
    this.$activeModal.dismiss('Dismiss')
  }
}

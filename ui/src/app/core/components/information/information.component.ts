import { Component, inject, Input } from '@angular/core'
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap'
import { TranslatePipe } from '@ngx-translate/core'
import { NgxMdModule } from 'ngx-md'

import { PluginsMarkdownDirective } from '@/app/core/directives/plugins.markdown.directive'

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
  private $activeModal = inject(NgbActiveModal)

  @Input() title: string
  @Input() subtitle?: string
  @Input() message: string
  @Input() message2?: string
  @Input() ctaButtonLabel?: string
  @Input() ctaButtonLink?: string
  @Input() faIconClass: string
  @Input() markdownMessage2?: string

  public dismissModal() {
    this.$activeModal.dismiss('Dismiss')
  }
}

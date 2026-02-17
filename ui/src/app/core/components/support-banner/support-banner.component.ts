import { ChangeDetectionStrategy, Component } from '@angular/core'
import { NgbAlert } from '@ng-bootstrap/ng-bootstrap/alert'
import { TranslatePipe } from '@ngx-translate/core'

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-support-banner',
  templateUrl: './support-banner.component.html',
  standalone: true,
  imports: [TranslatePipe, NgbAlert],
})
export class SupportBannerComponent {
  public readonly linkGithub = '<a href="https://github.com/homebridge/homebridge-config-ui-x/issues/new?template=feature-request.yml" target="_blank" rel="noopener noreferrer">GitHub</a>'
  public readonly linkDiscord = '<a href="https://discord.gg/kqNCe2D" target="_blank" rel="noopener noreferrer">Discord</a>'
}

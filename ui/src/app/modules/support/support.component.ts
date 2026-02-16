import { ChangeDetectionStrategy, Component, inject, OnInit, signal } from '@angular/core'
import { TranslatePipe, TranslateService } from '@ngx-translate/core'

import { SettingsService } from '@/app/core/ui/settings.service'
import { environment } from '@/environments/environment'

@Component({
  selector: 'app-support',
  imports: [
    TranslatePipe,
  ],
  standalone: true,
  templateUrl: './support.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SupportComponent implements OnInit {
  // Injected dependencies
  private $settings = inject(SettingsService)
  private $translate = inject(TranslateService)

  // Signals
  public readonly showFields = signal({
    general: true,
    dev: true,
  })

  // Other properties
  private swaggerEndpoint = '/swagger'

  public ngOnInit(): void {
    // Set page title
    const title = this.$translate.instant('support.title')
    this.$settings.setPageTitle(title)
  }

  public get swaggerUrl(): string {
    // In development mode, point to the backend server directly
    return environment.production
      ? this.swaggerEndpoint
      : `${environment.api.origin}${this.swaggerEndpoint}`
  }

  public toggleSection(section: string): void {
    this.showFields.update(fields => ({
      ...fields,
      [section]: !fields[section],
    }))
  }
}

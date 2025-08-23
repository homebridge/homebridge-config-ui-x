import { NgClass } from '@angular/common'
import { Component, inject } from '@angular/core'
import { TranslatePipe } from '@ngx-translate/core'

import { SettingsService } from '@/app/core/settings.service'
import { environment } from '@/environments/environment'

@Component({
  templateUrl: './support.component.html',
  standalone: true,
  imports: [
    NgClass,
    TranslatePipe,
  ],
})
export class SupportComponent {
  private $settings = inject(SettingsService)
  private swaggerEndpoint = '/swagger'
  public showFields = {
    general: true,
    dev: true,
  }

  public get swaggerUrl(): string {
    // In development mode, point to the backend server directly
    return environment.production
      ? this.swaggerEndpoint
      : `${environment.api.origin}${this.swaggerEndpoint}`
  }

  public toggleSection(section: string) {
    this.showFields[section] = !this.showFields[section]
  }
}

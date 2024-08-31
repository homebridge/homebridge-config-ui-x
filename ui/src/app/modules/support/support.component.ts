import { Component } from '@angular/core';
import { SettingsService } from '@/app/core/settings.service';

@Component({
  templateUrl: './support.component.html',
})
export class SupportComponent {
  public showFields = {
    general: true,
    dev: true,
  };

  constructor(
    public $settings: SettingsService,
  ) {}

  toggleSection(section: string) {
    this.showFields[section] = !this.showFields[section];
  }
}

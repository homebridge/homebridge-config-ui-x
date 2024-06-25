import { Component } from '@angular/core';
import { SettingsService } from '@/app/core/settings.service';

@Component({
  selector: 'app-support',
  templateUrl: './support.component.html',
  styleUrls: ['./support.component.scss'],
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

import { NgClass } from '@angular/common'
import { Component } from '@angular/core'
import { TranslatePipe } from '@ngx-translate/core'

@Component({
  templateUrl: './support.component.html',
  imports: [
    NgClass,
    TranslatePipe,
  ],
})
export class SupportComponent {
  public showFields = {
    general: true,
    dev: true,
  }

  constructor() {}

  toggleSection(section: string) {
    this.showFields[section] = !this.showFields[section]
  }
}

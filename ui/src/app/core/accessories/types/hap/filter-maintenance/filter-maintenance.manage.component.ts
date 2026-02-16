import { ChangeDetectionStrategy, Component } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { TranslatePipe } from '@ngx-translate/core'
import { NouisliderComponent } from 'ng2-nouislider'

import { BaseManageComponent } from '@/app/core/accessories/types/base-manage.component'

@Component({
  selector: 'app-filter-maintenance-manage',
  imports: [
    FormsModule,
    NouisliderComponent,
    TranslatePipe,
  ],
  standalone: true,
  templateUrl: './filter-maintenance.manage.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FilterMaintenanceManageComponent extends BaseManageComponent {
  public targetMode: number

  protected setupComponent() {
    this.applySliderGradient('linear-gradient(to right, #d32f2f, #e69533, #42d672, #42d672)')
  }

  protected handleAccessoryUpdate() {
    // No manual updates needed: service.values.FilterLifeLevel is bound directly in template
  }

  public resetFilterLife(event: MouseEvent) {
    void this.service.getCharacteristic('ResetFilterIndication').setValue(1)

    this.blurTarget(event)
  }
}

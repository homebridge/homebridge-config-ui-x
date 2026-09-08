import { ChangeDetectionStrategy, Component, inject, InjectionToken } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap/modal'
import { TranslatePipe } from '@ngx-translate/core'

interface SmartAutomationSettingsData {
  debugEnabled: boolean
  save: (enabled: boolean) => void
}

export const SMART_AUTOMATION_SETTINGS_DATA = new InjectionToken<SmartAutomationSettingsData>('SmartAutomationSettingsData')

@Component({
  selector: 'app-smart-automation-settings',
  imports: [FormsModule, TranslatePipe],
  standalone: true,
  templateUrl: './smart-automation-settings.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SmartAutomationSettingsComponent {
  private $activeModal = inject(NgbActiveModal)
  private data = inject(SMART_AUTOMATION_SETTINGS_DATA)

  public debugEnabled = this.data.debugEnabled

  public save(): void {
    this.data.save(this.debugEnabled)
    this.$activeModal.close()
  }

  public dismiss(): void {
    this.$activeModal.dismiss()
  }
}

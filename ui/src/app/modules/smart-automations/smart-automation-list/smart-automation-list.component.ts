import { ChangeDetectionStrategy, Component, input, output } from '@angular/core'
import { TranslatePipe } from '@ngx-translate/core'

import { SmartAutomation } from '@/app/core/accessories/accessories.interfaces'

@Component({
  selector: 'app-smart-automation-list',
  imports: [TranslatePipe],
  standalone: true,
  templateUrl: './smart-automation-list.component.html',
  styleUrl: './smart-automation-list.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SmartAutomationListComponent {
  public readonly automations = input<SmartAutomation[]>([])
  public readonly loading = input(false)
  public readonly setEnabled = output<{ automation: SmartAutomation, enabled: boolean }>()
  public readonly edit = output<SmartAutomation>()
  public readonly delete = output<string>()

  public getLightbulbTypeLabel(type: SmartAutomation['lightbulbType']): string {
    return {
      'on-off': 'smart_automation.light_type.on_off',
      'dimmable': 'smart_automation.light_type.dimmable',
      'colour': 'smart_automation.light_type.colour',
      'temperature': 'smart_automation.light_type.temperature',
    }[type || 'on-off']
  }
}

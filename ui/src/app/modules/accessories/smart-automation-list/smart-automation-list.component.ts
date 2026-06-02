import { ChangeDetectionStrategy, Component, input, output } from '@angular/core'
import { FormsModule } from '@angular/forms'

import { SmartAutomation } from '@/app/core/accessories/accessories.interfaces'

@Component({
  selector: 'app-smart-automation-list',
  imports: [FormsModule],
  standalone: true,
  templateUrl: './smart-automation-list.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SmartAutomationListComponent {
  public readonly automations = input<SmartAutomation[]>([])
  public readonly automationSwitchStates = input<Record<string, boolean>>({})
  public readonly toggleSwitch = output<{ automation: SmartAutomation, enabled: boolean }>()
  public readonly setEnabled = output<{ automation: SmartAutomation, enabled: boolean }>()
  public readonly edit = output<SmartAutomation>()
  public readonly delete = output<string>()

  public isAutomationSwitchOn(id: string): boolean {
    return !!this.automationSwitchStates()[id]
  }
}

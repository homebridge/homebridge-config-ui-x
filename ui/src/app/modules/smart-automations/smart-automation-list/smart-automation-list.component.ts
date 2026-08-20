import { ChangeDetectionStrategy, Component, input, output } from '@angular/core'

import { SmartAutomation } from '@/app/core/accessories/accessories.interfaces'

@Component({
  selector: 'app-smart-automation-list',
  standalone: true,
  templateUrl: './smart-automation-list.component.html',
  styleUrl: './smart-automation-list.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SmartAutomationListComponent {
  public readonly automations = input<SmartAutomation[]>([])
  public readonly setEnabled = output<{ automation: SmartAutomation, enabled: boolean }>()
  public readonly edit = output<SmartAutomation>()
  public readonly delete = output<string>()
}

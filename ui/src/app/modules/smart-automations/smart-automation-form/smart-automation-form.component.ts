import { ChangeDetectionStrategy, Component, input, output } from '@angular/core'
import { FormsModule } from '@angular/forms'

import { ServiceTypeX, SmartAutomation } from '@/app/core/accessories/accessories.interfaces'

@Component({
  selector: 'app-smart-automation-form',
  imports: [FormsModule],
  standalone: true,
  templateUrl: './smart-automation-form.component.html',
  styleUrl: './smart-automation-form.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SmartAutomationFormComponent {
  public readonly draft = input.required<Partial<SmartAutomation>>()
  public readonly rooms = input<Array<{ name: string, isDefault?: boolean, services: ServiceTypeX[] }>>([])
  public readonly selectedLightUniqueIds = input<string[]>([])
  public readonly lightSelectionChange = output<{ uniqueId: string, selected: boolean }>()
  public readonly save = output<void>()

  public onLightSelectionChange(uniqueId: string, selected: boolean): void {
    this.lightSelectionChange.emit({ uniqueId, selected })
  }

  public updateDraft(name: keyof SmartAutomation, value: string | number | boolean): void {
    this.draft()[name] = value as never
  }

  public getAutomationDescription(type: SmartAutomation['type'] | undefined): string {
    if (type === 'smart-light-group') {
      return 'Publishes a switch that stores all writable characteristics for the selected lights, then restores their complete saved state when turned off. Designed for use with Siri or other voice assistants; it does not work through direct control in the Home app.'
    }

    return 'Select an automation type to see how it works.'
  }
}

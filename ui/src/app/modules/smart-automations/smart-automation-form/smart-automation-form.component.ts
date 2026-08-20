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
  public readonly lightSelectionChange = output<{ uniqueId: string, selected: boolean, single?: boolean }>()
  public readonly save = output<void>()

  public onLightSelectionChange(uniqueId: string, selected: boolean): void {
    this.lightSelectionChange.emit({ uniqueId, selected })
  }

  public updateDraft(name: keyof SmartAutomation, value: string | number | boolean): void {
    this.draft()[name] = value as never
  }

  public getAutomationDescription(type: SmartAutomation['type'] | undefined): string {
    if (type === 'smart-light-group') {
      return 'Publishes a light that stores the selected lights’ complete state, passes brightness and colour changes through while on, then restores the original state when turned off. Designed for use with Siri or other voice assistants; it does not work through direct control in the Home app.'
    }

    if (type === 'door-ajar') {
      return 'Publishes a contact sensor for the chosen door. If the door is left open longer than the time below, the sensor opens — use that as the trigger for a Home app automation. While the door stays open it keeps alerting at the repeat interval, and it resets as soon as the door is closed.'
    }

    return 'Select an automation type to see how it works.'
  }

  /**
   * The accessory types this automation can be pointed at.
   *
   * A door rule accepts anything that reports whether it is shut, which
   * includes a contact sensor on a door that has no opener of its own.
   * @param type - the automation type being configured
   */
  public selectableTypes(type: SmartAutomation['type'] | undefined): string[] {
    return type === 'door-ajar'
      ? ['GarageDoorOpener', 'Door', 'Window', 'WindowCovering', 'ContactSensor']
      : ['Lightbulb']
  }

  public isSelectable(serviceType: string | undefined, type: SmartAutomation['type'] | undefined): boolean {
    return this.selectableTypes(type).includes(serviceType || '')
  }

  /**
   * A door rule watches exactly one door, so choosing another replaces the
   * first rather than adding to it.
   * @param uniqueId - the accessory chosen
   * @param selected - whether it was ticked or unticked
   */
  public onDoorSelectionChange(uniqueId: string, selected: boolean): void {
    this.lightSelectionChange.emit({ uniqueId, selected, single: true })
  }
}

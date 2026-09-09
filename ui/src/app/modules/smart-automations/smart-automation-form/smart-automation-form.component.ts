import { ChangeDetectionStrategy, Component, input, output } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { TranslatePipe } from '@ngx-translate/core'

import { ServiceTypeX, SmartAutomation } from '@/app/core/accessories/accessories.interfaces'

@Component({
  selector: 'app-smart-automation-form',
  imports: [FormsModule, TranslatePipe],
  standalone: true,
  templateUrl: './smart-automation-form.component.html',
  styleUrl: './smart-automation-form.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SmartAutomationFormComponent {
  public readonly draft = input.required<Partial<SmartAutomation>>()
  public readonly rooms = input<Array<{ name: string, isDefault?: boolean, services: ServiceTypeX[] }>>([])
  public readonly selectedLightUniqueIds = input<string[]>([])
  public readonly selectedTargetUniqueId = input('')
  public readonly lightSelectionChange = output<{ uniqueId: string, selected: boolean, single?: boolean, target?: boolean }>()
  public readonly automationTypeChange = output<SmartAutomation['type']>()
  public readonly cancelEdit = output<void>()
  public readonly save = output<void>()

  public onLightSelectionChange(uniqueId: string, selected: boolean): void {
    this.lightSelectionChange.emit({ uniqueId, selected })
  }

  public onAccessorySelectionChange(uniqueId: string, event: Event, single: boolean): void {
    const selected = (event.target as HTMLInputElement).checked
    this.lightSelectionChange.emit({ uniqueId, selected, single })
  }

  public updateDraft(name: keyof SmartAutomation, value: string | number | boolean): void {
    this.draft()[name] = value as never
  }

  public onAutomationTypeChange(type: SmartAutomation['type']): void {
    this.updateDraft('type', type)
    this.automationTypeChange.emit(type)
  }

  public getAutomationDescription(type: SmartAutomation['type'] | undefined): string {
    if (type === 'smart-light-group') {
      return 'smart_automation.description.smart_light_group'
    }

    if (type === 'door-ajar') {
      return 'smart_automation.description.door_ajar'
    }

    if (type === 'humidity-control') {
      return 'smart_automation.description.humidity_control'
    }

    if (type === 'average-temperature') {
      return 'smart_automation.description.average_temperature'
    }

    return 'smart_automation.description.select_type'
  }

  /**
   * The accessory types this automation can be pointed at.
   *
   * A door rule accepts anything that reports whether it is shut, which
   * includes a contact sensor on a door that has no opener of its own.
   * @param type - the automation type being configured
   */
  public selectableTypes(type: SmartAutomation['type'] | undefined): string[] {
    if (type === 'door-ajar') {
      return ['GarageDoorOpener', 'Door', 'Window', 'WindowCovering', 'ContactSensor']
    }
    if (type === 'average-temperature') {
      return ['TemperatureSensor', 'Thermostat', 'HeaterCooler']
    }
    if (type === 'humidity-control') {
      return ['HumiditySensor', 'HumidifierDehumidifier', 'Thermostat']
    }
    return ['Lightbulb']
  }

  public isSelectable(serviceType: string | undefined, type: SmartAutomation['type'] | undefined): boolean {
    return this.selectableTypes(type).includes(serviceType || '')
  }

  public isSourceSelectable(service: ServiceTypeX, type: SmartAutomation['type'] | undefined): boolean {
    if (!this.isSelectable(service.type, type) || this.isOwnPublishedAccessory(service)) {
      return false
    }
    const requiredCharacteristic = type === 'humidity-control'
      ? 'CurrentRelativeHumidity'
      : type === 'average-temperature'
        ? 'CurrentTemperature'
        : undefined
    return !requiredCharacteristic
      || service.serviceCharacteristics.some(characteristic => characteristic.type === requiredCharacteristic)
  }

  /**
   * A door rule watches exactly one door, so choosing another replaces the
   * first rather than adding to it.
   * @param uniqueId - the accessory chosen
   * @param event - the changed radio input
   */
  public onDoorSelectionChange(uniqueId: string, event: Event): void {
    const selected = (event.target as HTMLInputElement).checked
    this.lightSelectionChange.emit({ uniqueId, selected, single: true })
  }

  public onTargetSelectionChange(uniqueId: string, event: Event): void {
    const selected = (event.target as HTMLInputElement).checked
    this.lightSelectionChange.emit({ uniqueId, selected, single: true, target: true })
  }

  public isControlTarget(service: ServiceTypeX): boolean {
    return !this.isOwnPublishedAccessory(service)
      && ['Switch', 'Outlet', 'Fan', 'Fanv2', 'HeaterCooler', 'Thermostat', 'AirPurifier'].includes(service.type || '')
      && service.serviceCharacteristics.some(characteristic => characteristic.canWrite && ['On', 'Active', 'TargetHeatingCoolingState'].includes(characteristic.type))
  }

  /**
   * Prevent an automation from consuming its own published accessory, which
   * would create a feedback loop. Outputs from every other automation remain
   * selectable so rules can intentionally be chained together.
   * @param service - a discovered Homebridge service
   */
  private isOwnPublishedAccessory(service: ServiceTypeX): boolean {
    const automationId = this.draft().id
    return Boolean(
      automationId
      && service.accessoryInformation?.Manufacturer === 'homebridge-config-ui-x'
      && service.accessoryInformation?.['Serial Number'] === automationId,
    )
  }

  public canSave(): boolean {
    return Boolean(
      this.draft().name?.trim()
      && this.selectedLightUniqueIds().length
      && (this.draft().type !== 'humidity-control' || this.selectedTargetUniqueId()),
    )
  }
}

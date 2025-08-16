import { Component, inject, Input } from '@angular/core'
import { TranslatePipe } from '@ngx-translate/core'

import { ServiceTypeX } from '@/app/core/accessories/accessories.interfaces'
import { AccessoriesService } from '@/app/core/accessories/accessories.service'
import { AirPurifierComponent } from '@/app/core/accessories/types/air-purifier/air-purifier.component'
import { AirQualitySensorComponent } from '@/app/core/accessories/types/air-quality-sensor/air-quality-sensor.component'
import { BatteryComponent } from '@/app/core/accessories/types/battery/battery.component'
import { CarbonDioxideSensorComponent } from '@/app/core/accessories/types/carbon-dioxide-sensor/carbon-dioxide-sensor.component'
import { CarbonMonoxideSensorComponent } from '@/app/core/accessories/types/carbon-monoxide-sensor/carbon-monoxide-sensor.component'
import { ContactSensorComponent } from '@/app/core/accessories/types/contact-sensor/contact-sensor.component'
import { DoorComponent } from '@/app/core/accessories/types/door/door.component'
import { DoorbellComponent } from '@/app/core/accessories/types/doorbell/doorbell.component'
import { FanComponent } from '@/app/core/accessories/types/fan/fan.component'
import { FilterMaintenanceComponent } from '@/app/core/accessories/types/filter-maintenance/filter-maintenance.component'
import { GarageDoorOpenerComponent } from '@/app/core/accessories/types/garage-door-opener/garage-door-opener.component'
import { HeaterCoolerComponent } from '@/app/core/accessories/types/heater-cooler/heater-cooler.component'
import { HumidifierDehumidifierComponent } from '@/app/core/accessories/types/humidifier-dehumidifier/humidifier-dehumidifier.component'
import { HumiditySensorComponent } from '@/app/core/accessories/types/humidity-sensor/humidity-sensor.component'
import { IrrigationSystemComponent } from '@/app/core/accessories/types/irrigation-system/irrigation-system.component'
import { LeakSensorComponent } from '@/app/core/accessories/types/leak-sensor/leak-sensor.component'
import { LightSensorComponent } from '@/app/core/accessories/types/light-sensor/light-sensor.component'
import { LightbulbComponent } from '@/app/core/accessories/types/lightbulb/lightbulb.component'
import { LockMechanismComponent } from '@/app/core/accessories/types/lock-mechanism/lock-mechanism.component'
import { MicrophoneComponent } from '@/app/core/accessories/types/microphone/microphone.component'
import { MotionSensorComponent } from '@/app/core/accessories/types/motion-sensor/motion-sensor.component'
import { OccupancySensorComponent } from '@/app/core/accessories/types/occupancy-sensor/occupancy-sensor.component'
import { OutletComponent } from '@/app/core/accessories/types/outlet/outlet.component'
import { RobotVacuumComponent } from '@/app/core/accessories/types/robot-vacuum/robot-vacuum.component'
import { SecuritySystemComponent } from '@/app/core/accessories/types/security-system/security-system.component'
import { SmokeSensorComponent } from '@/app/core/accessories/types/smoke-sensor/smoke-sensor.component'
import { SpeakerComponent } from '@/app/core/accessories/types/speaker/speaker.component'
import { StatelessProgrammableSwitchComponent } from '@/app/core/accessories/types/stateless-programmable-switch/stateless-programmable-switch.component'
import { SwitchComponent } from '@/app/core/accessories/types/switch/switch.component'
import { TelevisionComponent } from '@/app/core/accessories/types/television/television.component'
import { TemperatureSensorComponent } from '@/app/core/accessories/types/temperature-sensor/temperature-sensor.component'
import { ThermostatComponent } from '@/app/core/accessories/types/thermostat/thermostat.component'
import { UnknownComponent } from '@/app/core/accessories/types/unknown/unknown.component'
import { ValveComponent } from '@/app/core/accessories/types/valve/valve.component'
import { WashingMachineComponent } from '@/app/core/accessories/types/washing-machine/washing-machine.component'
import { WindowCoveringComponent } from '@/app/core/accessories/types/window-covering/window-covering.component'
import { WindowComponent } from '@/app/core/accessories/types/window/window.component'

@Component({
  selector: 'app-accessory-tile',
  templateUrl: './accessory-tile.component.html',
  standalone: true,
  imports: [
    SwitchComponent,
    ThermostatComponent,
    OutletComponent,
    FanComponent,
    AirPurifierComponent,
    LightbulbComponent,
    LightSensorComponent,
    LockMechanismComponent,
    TemperatureSensorComponent,
    GarageDoorOpenerComponent,
    MotionSensorComponent,
    OccupancySensorComponent,
    ContactSensorComponent,
    HumiditySensorComponent,
    AirQualitySensorComponent,
    WindowCoveringComponent,
    WindowComponent,
    DoorComponent,
    TelevisionComponent,
    BatteryComponent,
    SpeakerComponent,
    SecuritySystemComponent,
    LeakSensorComponent,
    SmokeSensorComponent,
    CarbonMonoxideSensorComponent,
    CarbonDioxideSensorComponent,
    ValveComponent,
    IrrigationSystemComponent,
    HeaterCoolerComponent,
    HumidifierDehumidifierComponent,
    StatelessProgrammableSwitchComponent,
    FilterMaintenanceComponent,
    DoorbellComponent,
    UnknownComponent,
    MicrophoneComponent,
    RobotVacuumComponent,
    WashingMachineComponent,
    TranslatePipe,
  ],
})
export class AccessoryTileComponent {
  $accessories = inject(AccessoriesService)

  @Input() public service: ServiceTypeX
}

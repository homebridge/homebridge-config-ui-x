import { Component, inject, Input } from '@angular/core'
import { TranslatePipe } from '@ngx-translate/core'

import { ServiceTypeX } from '@/app/core/accessories/accessories.interfaces'
import { AccessoriesService } from '@/app/core/accessories/accessories.service'
import { AccessCodeComponent } from '@/app/core/accessories/types/hap/access-code/access-code.component'
import { AirPurifierComponent } from '@/app/core/accessories/types/hap/air-purifier/air-purifier.component'
import { AirQualitySensorComponent } from '@/app/core/accessories/types/hap/air-quality-sensor/air-quality-sensor.component'
import { BatteryComponent } from '@/app/core/accessories/types/hap/battery/battery.component'
import { CarbonDioxideSensorComponent } from '@/app/core/accessories/types/hap/carbon-dioxide-sensor/carbon-dioxide-sensor.component'
import { CarbonMonoxideSensorComponent } from '@/app/core/accessories/types/hap/carbon-monoxide-sensor/carbon-monoxide-sensor.component'
import { ContactSensorComponent } from '@/app/core/accessories/types/hap/contact-sensor/contact-sensor.component'
import { DoorComponent } from '@/app/core/accessories/types/hap/door/door.component'
import { DoorbellComponent } from '@/app/core/accessories/types/hap/doorbell/doorbell.component'
import { FanComponent } from '@/app/core/accessories/types/hap/fan/fan.component'
import { FilterMaintenanceComponent } from '@/app/core/accessories/types/hap/filter-maintenance/filter-maintenance.component'
import { GarageDoorOpenerComponent } from '@/app/core/accessories/types/hap/garage-door-opener/garage-door-opener.component'
import { HeaterCoolerComponent } from '@/app/core/accessories/types/hap/heater-cooler/heater-cooler.component'
import { HumidifierDehumidifierComponent } from '@/app/core/accessories/types/hap/humidifier-dehumidifier/humidifier-dehumidifier.component'
import { HumiditySensorComponent } from '@/app/core/accessories/types/hap/humidity-sensor/humidity-sensor.component'
import { IrrigationSystemComponent } from '@/app/core/accessories/types/hap/irrigation-system/irrigation-system.component'
import { LeakSensorComponent } from '@/app/core/accessories/types/hap/leak-sensor/leak-sensor.component'
import { LightSensorComponent } from '@/app/core/accessories/types/hap/light-sensor/light-sensor.component'
import { LightbulbComponent } from '@/app/core/accessories/types/hap/lightbulb/lightbulb.component'
import { LockMechanismComponent } from '@/app/core/accessories/types/hap/lock-mechanism/lock-mechanism.component'
import { MicrophoneComponent } from '@/app/core/accessories/types/hap/microphone/microphone.component'
import { MotionSensorComponent } from '@/app/core/accessories/types/hap/motion-sensor/motion-sensor.component'
import { OccupancySensorComponent } from '@/app/core/accessories/types/hap/occupancy-sensor/occupancy-sensor.component'
import { OutletComponent } from '@/app/core/accessories/types/hap/outlet/outlet.component'
import { RobotVacuumComponent } from '@/app/core/accessories/types/hap/robot-vacuum/robot-vacuum.component'
import { SecuritySystemComponent } from '@/app/core/accessories/types/hap/security-system/security-system.component'
import { SmokeSensorComponent } from '@/app/core/accessories/types/hap/smoke-sensor/smoke-sensor.component'
import { SpeakerComponent } from '@/app/core/accessories/types/hap/speaker/speaker.component'
import { StatelessProgrammableSwitchComponent } from '@/app/core/accessories/types/hap/stateless-programmable-switch/stateless-programmable-switch.component'
import { SwitchComponent } from '@/app/core/accessories/types/hap/switch/switch.component'
import { TelevisionComponent } from '@/app/core/accessories/types/hap/television/television.component'
import { TemperatureSensorComponent } from '@/app/core/accessories/types/hap/temperature-sensor/temperature-sensor.component'
import { ThermostatComponent } from '@/app/core/accessories/types/hap/thermostat/thermostat.component'
import { UnknownComponent } from '@/app/core/accessories/types/hap/unknown/unknown.component'
import { ValveComponent } from '@/app/core/accessories/types/hap/valve/valve.component'
import { WashingMachineComponent } from '@/app/core/accessories/types/hap/washing-machine/washing-machine.component'
import { WindowCoveringComponent } from '@/app/core/accessories/types/hap/window-covering/window-covering.component'
import { WindowComponent } from '@/app/core/accessories/types/hap/window/window.component'
import { MatterAirQualitySensorComponent } from '@/app/core/accessories/types/matter/air-quality-sensor/air-quality-sensor.component'
import { ColorTemperatureLightComponent } from '@/app/core/accessories/types/matter/color-temperature-light/color-temperature-light.component'
import { MatterContactSensorComponent } from '@/app/core/accessories/types/matter/contact-sensor/contact-sensor.component'
import { DimmableLightComponent } from '@/app/core/accessories/types/matter/dimmable-light/dimmable-light.component'
import { MatterDoorLockComponent } from '@/app/core/accessories/types/matter/door-lock/door-lock.component'
import { ExtendedColorLightComponent } from '@/app/core/accessories/types/matter/extended-color-light/extended-color-light.component'
import { MatterFanComponent } from '@/app/core/accessories/types/matter/fan/fan.component'
import { MatterHumiditySensorComponent } from '@/app/core/accessories/types/matter/humidity-sensor/humidity-sensor.component'
import { MatterLightSensorComponent } from '@/app/core/accessories/types/matter/light-sensor/light-sensor.component'
import { MatterOccupancySensorComponent } from '@/app/core/accessories/types/matter/occupancy-sensor/occupancy-sensor.component'
import { OnOffLightSwitchComponent } from '@/app/core/accessories/types/matter/on-off-light-switch/on-off-light-switch.component'
import { OnOffLightComponent } from '@/app/core/accessories/types/matter/on-off-light/on-off-light.component'
import { OnOffPlugInUnitComponent } from '@/app/core/accessories/types/matter/on-off-plug-in-unit/on-off-plug-in-unit.component'
import { RoboticVacuumCleanerComponent } from '@/app/core/accessories/types/matter/robotic-vacuum-cleaner/robotic-vacuum-cleaner.component'
import { MatterSmokeCoAlarmComponent } from '@/app/core/accessories/types/matter/smoke-co-alarm/smoke-co-alarm.component'
import { MatterTemperatureSensorComponent } from '@/app/core/accessories/types/matter/temperature-sensor/temperature-sensor.component'
import { MatterThermostatComponent } from '@/app/core/accessories/types/matter/thermostat/thermostat.component'
import { MatterUnknownComponent } from '@/app/core/accessories/types/matter/unknown/unknown.component'
import { MatterWaterLeakDetectorComponent } from '@/app/core/accessories/types/matter/water-leak-detector/water-leak-detector.component'
import { MatterWindowCoveringComponent } from '@/app/core/accessories/types/matter/window-covering/window-covering.component'

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
    OnOffLightComponent,
    OnOffPlugInUnitComponent,
    OnOffLightSwitchComponent,
    DimmableLightComponent,
    ColorTemperatureLightComponent,
    ExtendedColorLightComponent,
    RoboticVacuumCleanerComponent,
    MatterContactSensorComponent,
    MatterOccupancySensorComponent,
    MatterLightSensorComponent,
    MatterTemperatureSensorComponent,
    MatterHumiditySensorComponent,
    MatterSmokeCoAlarmComponent,
    MatterWaterLeakDetectorComponent,
    MatterAirQualitySensorComponent,
    MatterDoorLockComponent,
    MatterWindowCoveringComponent,
    MatterFanComponent,
    MatterThermostatComponent,
    MatterUnknownComponent,
    TranslatePipe,
    AccessCodeComponent,
  ],
})
export class AccessoryTileComponent {
  $accessories = inject(AccessoriesService)

  @Input() public service: ServiceTypeX
}

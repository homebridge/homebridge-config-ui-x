# Smart Automation

> Smart Automation is currently an alpha feature. Its behaviour and user interface may change before the final release.

Smart Automation lets Homebridge monitor and control accessories without requiring a separate automation plugin. Each automation runs in a dedicated Smart Automation child bridge.

To create one, open **Smart Automation** in the Homebridge UI, enter a name, choose an automation type and select the accessories to use. Make sure **Enabled** is selected, then choose **Create automation**. Saving, editing, enabling, disabling or deleting an automation automatically restarts only the Smart Automation child bridge so the change can take effect.

## Smart Light Group

A Smart Light Group combines several lights into one temporary control. It is useful for commands such as “turn on the downstairs lights” while preserving the state each light had before the command.

When the group is turned on, Smart Automation:

1. Saves the current state of every selected light, including its on/off state and any writable brightness, colour or colour-temperature settings.
2. Turns on all selected lights.
3. Passes supported brightness, colour or colour-temperature changes to the lights while the group is on.

When the group is turned off, every light is restored to the state it had before the group was turned on. For example, a light that was already on at 40% returns to 40%, while a light that was originally off turns off again.

### Published light types

- **On/Off only** controls only the power state.
- **Dimmable** also passes brightness changes to the selected lights.
- **Colour** passes brightness, hue and saturation changes.
- **Temperature** passes brightness and colour-temperature changes.

Choose a type supported by all lights in the group. A light that does not provide a requested writable setting is skipped for that setting.

> Smart Light Group is designed for Siri and other voice-assistant commands. Directly controlling its published light in the Apple Home app is not currently supported.

## Door Left Ajar

Door Left Ajar watches one door and publishes a separate contact sensor that can be used as a Home app automation trigger.

- **Alert after** is how long the selected door may remain open before the published contact sensor opens.
- **Repeat every** controls how often the sensor triggers again while the door remains open.

The timer resets as soon as the selected door closes. If the door stays open, Smart Automation briefly resets the published sensor before each repeat so HomeKit sees a new event.

Supported sources include garage doors, doors, windows, window coverings and contact sensors. A garage door that is opening, closing or stopped before reaching its closed position is treated as open.

To use this automation, create a Home app automation that starts when the new contact sensor opens, then select the action you want to run. Door changes are received through HomeKit accessory events, and the alert uses a timer for the configured delay.

## Humidity-controlled AC

Humidity-controlled AC watches one humidity sensor and turns a selected air conditioner or other control on and off using two thresholds.

- The target turns **on only when humidity is above** the high threshold.
- The target turns **off only when humidity is below** the low threshold.
- No change is made while humidity is equal to a threshold or between the two thresholds.

The low threshold must be lower than the high threshold. The gap between them prevents the target from rapidly switching on and off when humidity fluctuates around one value. For example, with **On above 60%** and **Off below 50%**, the target turns on at 61% or higher, remains unchanged from 50% through 60%, and turns off at 49% or lower.

The source can be a humidity sensor, humidifier/dehumidifier or thermostat that reports current relative humidity. Supported targets include switches, outlets, fans, heater/coolers, thermostats and air purifiers with a writable control. A thermostat is placed into cooling mode when turned on and into off mode when turned off.

Humidity changes are received through HomeKit accessory events. This automation controls the selected target directly and does not publish an additional accessory in HomeKit.

## Average Temperature Sensor

Average Temperature Sensor combines readings from multiple temperature sensors and publishes their arithmetic mean as one HomeKit temperature sensor.

For example, readings of 20.0 °C, 21.0 °C and 22.0 °C produce an average temperature of 21.0 °C. The result is rounded to one decimal place.

Temperature sensors, thermostats and heater/coolers can be selected when they report a current temperature. A selected sensor without a current numeric reading is temporarily ignored. If none of the selected sensors has a valid reading, the published sensor keeps its previous value until a new average can be calculated.

The average is refreshed whenever a selected sensor reports a HomeKit accessory event. You can display the published sensor in HomeKit or use it as the input to another Home app automation.

## Managing automations

The **Your automations** list shows every configured automation and whether it is enabled. From there you can:

- disable an automation without deleting its configuration;
- enable a disabled automation;
- edit its name, settings or selected accessories; or
- permanently delete it.

Enable **Debug logging** if an automation is not behaving as expected, reproduce the problem and check the Homebridge logs. Useful checks include confirming that all selected accessories are available, that their values update correctly in Homebridge and that the target characteristics are writable.

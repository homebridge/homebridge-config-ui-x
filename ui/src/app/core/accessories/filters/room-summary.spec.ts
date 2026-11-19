import { describe, expect, it } from 'vitest'

import { summarizeRoom } from '@/app/core/accessories/filters/room-summary'
import { characteristic } from '@/testing'

import { hap, matter } from './accessory-filter.fixture'

describe('summarizeRoom', () => {
  it('returns zero counts for an empty room', () => {
    expect(summarizeRoom([], new Map())).toEqual({ lightsOn: 0, lowBattery: 0 })
  })

  it('counts lights that are on', () => {
    const services = [
      hap({
        type: 'Lightbulb',
        characteristics: [
          characteristic('On', true),
        ],
      }),
      hap({
        type: 'Lightbulb',
        characteristics: [
          characteristic('On', false),
        ],
      }),
      hap({
        type: 'Switch',
        characteristics: [
          characteristic('On', true),
        ],
      }),
      matter({
        deviceType: 'DimmableLight',
        clusters: {
          onOff: { onOff: true },
          levelControl: { currentLevel: 100 },
        },
      }),
    ]
    expect(summarizeRoom(services, new Map()).lightsOn).toBe(2)
  })

  it('averages HAP temperatures to one decimal place', () => {
    const services = [
      hap({
        type: 'TemperatureSensor',
        characteristics: [
          characteristic('CurrentTemperature', 20),
        ],
      }),
      hap({
        type: 'TemperatureSensor',
        characteristics: [
          characteristic('CurrentTemperature', 21.2),
        ],
      }),
      hap({
        type: 'Thermostat',
        characteristics: [
          characteristic('CurrentTemperature', 21.5),
        ],
      }),
    ]
    expect(summarizeRoom(services, new Map()).avgTemperature).toBe(20.9)
  })

  it('reads Matter temperature measurements in hundredths of a degree', () => {
    const services = [
      matter({
        deviceType: 'TemperatureSensor',
        clusters: {
          temperatureMeasurement: { measuredValue: 1850 },
        },
      }),
      matter({
        deviceType: 'TemperatureSensor',
        clusters: {
          temperatureMeasurement: { measuredValue: null },
        },
      }),
    ]
    expect(summarizeRoom(services, new Map()).avgTemperature).toBe(18.5)
  })

  it('leaves avgTemperature out when no service reports one', () => {
    const summary = summarizeRoom([
      hap({ type: 'Switch' }),
    ], new Map())
    expect(summary).not.toHaveProperty('avgTemperature')
  })

  it('counts services with a low battery', () => {
    const sensor = hap({ type: 'MotionSensor', uniqueId: 'a' })
    const other = hap({ type: 'MotionSensor', uniqueId: 'b' })
    const index = new Map([
      [
        'a',
        { level: 5, low: true, charging: false },
      ],
      [
        'b',
        { level: 80, low: false, charging: false },
      ],
    ])
    expect(summarizeRoom([sensor, other], index).lowBattery).toBe(1)
  })
})

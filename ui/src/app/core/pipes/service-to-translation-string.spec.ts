import { describe, expect, it } from 'vitest'

import { ServiceToTranslationStringPipe } from '@/app/core/pipes/service-to-translation-string'

describe('ServiceToTranslationStringPipe', () => {
  const pipe = new ServiceToTranslationStringPipe()

  it.each([
    ['Switch', 'accessories.core.switch'],
    ['Lightbulb', 'accessories.core.lightbulb'],
    ['HeaterCooler', 'accessories.core.heater_cooler'],
    ['SecuritySystem', 'accessories.core.security_system'],
    ['HumidifierDehumidifier', 'accessories.core.humidifier_dehumidifier'],
  ])('turns %s into %s', (value, expected) => {
    expect(pipe.transform(value)).toBe(expected)
  })

  it('sends SmartSpeaker to the Speaker label, which is the only special case', () => {
    // There is no dedicated SmartSpeaker translation, so it reuses Speaker
    expect(pipe.transform('SmartSpeaker')).toBe('accessories.core.speaker')
    expect(pipe.transform('Speaker')).toBe('accessories.core.speaker')
  })

  it('passes empty and non-string values straight through', () => {
    expect(pipe.transform('')).toBe('')
    expect(pipe.transform(null as any)).toBeNull()
    expect(pipe.transform(undefined as any)).toBeUndefined()
  })
})

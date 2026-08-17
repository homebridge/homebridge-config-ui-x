import { TestBed } from '@angular/core/testing'
import { describe, expect, it } from 'vitest'

import { ConvertTempPipe } from '@/app/core/pipes/convert-temp.pipe'
import { SettingsService } from '@/app/core/ui/settings.service'

describe('ConvertTempPipe', () => {
  function createPipe(temperatureUnits: 'c' | 'f'): ConvertTempPipe {
    TestBed.configureTestingModule({
      providers: [
        { provide: SettingsService, useValue: { env: { temperatureUnits } } },
      ],
    })
    return TestBed.runInInjectionContext(() => new ConvertTempPipe())
  }

  it('rounds celsius values to one decimal place', () => {
    const pipe = createPipe('c')
    expect(pipe.transform(21.5)).toBe(21.5)
    expect(pipe.transform(21.44)).toBe(21.4)
  })

  it('converts to fahrenheit when the settings unit is f', () => {
    const pipe = createPipe('f')
    expect(pipe.transform(0)).toBe(32)
    expect(pipe.transform(100)).toBe(212)
    expect(pipe.transform(21)).toBe(69.8)
  })

  it('lets an explicit unit argument override the settings', () => {
    const pipe = createPipe('c')
    expect(pipe.transform(0, 'f')).toBe(32)
  })
})

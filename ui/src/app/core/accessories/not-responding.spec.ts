import { describe, expect, it } from 'vitest'

import { isNotResponding, notRespondingCodes } from '@/app/core/accessories/not-responding'
import { characteristic, hapService } from '@/testing'

describe('isNotResponding', () => {
  const withStatus = (status?: number) => hapService({
    characteristics: [
      characteristic('On', true),
      characteristic('Brightness', 50, { status }),
    ],
  })

  it.each([-70402, -70408])('is true for status %i', (status) => {
    expect(isNotResponding(withStatus(status))).toBe(true)
  })

  it.each([0, undefined, -70404])('is false for status %s', (status) => {
    expect(isNotResponding(withStatus(status))).toBe(false)
  })

  it('is false with no characteristics or no service', () => {
    expect(isNotResponding({ serviceCharacteristics: [] })).toBe(false)
    expect(isNotResponding({})).toBe(false)
    expect(isNotResponding(undefined)).toBe(false)
  })

  it('lists each not responding code once', () => {
    const service = hapService({
      characteristics: [
        characteristic('On', true, { status: -70402 }),
        characteristic('Brightness', 50, { status: -70402 }),
        characteristic('Hue', 10, { status: -70408 }),
        characteristic('Saturation', 10, { status: -70404 }),
      ],
    })
    expect(notRespondingCodes(service)).toEqual([-70402, -70408])
    expect(notRespondingCodes(undefined)).toEqual([])
  })
})

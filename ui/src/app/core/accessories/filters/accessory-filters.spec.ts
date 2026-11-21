import type { AccessoryFilterState, RoomInput } from './accessory-filters'

import { describe, expect, it } from 'vitest'

import { buildBatteryIndex } from '@/app/core/accessories/filters/accessory-battery'
import { characteristic } from '@/testing'

import { batteryService, hap, matter } from './accessory-filter.fixture'
import { DEFAULT_FILTER_STATE, FLOOR_OTHER_KEY, groupAndSort, isFilterActive, matchesFilter } from './accessory-filters'

function state(overrides: Partial<AccessoryFilterState> = {}): AccessoryFilterState {
  return {
    ...DEFAULT_FILTER_STATE,
    ...overrides,
  }
}
const emptyIndex = new Map()
const ids = (groups: Array<{ services: { uniqueId?: string }[] }>) => groups.map(g => g.services.map(s => s.uniqueId))

describe('isFilterActive', () => {
  it('is false for the default state', () => {
    expect(isFilterActive(state())).toBe(false)
  })

  it('ignores grouping and sorting', () => {
    expect(isFilterActive(state({ groupBy: 'category', sortBy: 'battery' }))).toBe(false)
  })

  it('is true for each filter dimension', () => {
    expect(isFilterActive(state({ search: 'kitchen' }))).toBe(true)
    expect(isFilterActive(state({ search: '   ' }))).toBe(false)
    expect(isFilterActive(state({
      rooms: ['Hall'],
    }))).toBe(true)
    expect(isFilterActive(state({
      categories: ['lights'],
    }))).toBe(true)
    expect(isFilterActive(state({
      bridges: ['Bridge'],
    }))).toBe(true)
    expect(isFilterActive(state({
      protocols: ['matter'],
    }))).toBe(true)
    expect(isFilterActive(state({
      states: ['on'],
    }))).toBe(true)
    expect(isFilterActive(state({
      battery: ['low'],
    }))).toBe(true)
    expect(isFilterActive(state({ showHidden: true }))).toBe(true)
    expect(isFilterActive(state({ onDashboardOnly: true }))).toBe(true)
  })
})

describe('matchesFilter', () => {
  const lamp = hap({
    type: 'Lightbulb',
    customName: 'Desk Lamp',
    manufacturer: 'Acme',
    characteristics: [
      characteristic('On', true),
    ],
  })

  it('matches everything with the default state', () => {
    expect(matchesFilter(lamp, 'Office', state(), emptyIndex)).toBe(true)
  })

  it('hides hidden services unless showHidden is set', () => {
    const hidden = hap({ type: 'Switch', hidden: true })
    expect(matchesFilter(hidden, 'Office', state(), emptyIndex)).toBe(false)
    expect(matchesFilter(hidden, 'Office', state({ showHidden: true }), emptyIndex)).toBe(true)
  })

  it('keeps only dashboard services when onDashboardOnly is set', () => {
    expect(matchesFilter(lamp, 'Office', state({ onDashboardOnly: true }), emptyIndex)).toBe(false)
    expect(matchesFilter(hap({ type: 'Switch', onDashboard: true }), 'Office', state({ onDashboardOnly: true }), emptyIndex)).toBe(true)
  })

  describe('search', () => {
    it('matches the custom name, service name, and manufacturer case-insensitively', () => {
      expect(matchesFilter(lamp, 'Office', state({ search: 'DESK' }), emptyIndex)).toBe(true)
      expect(matchesFilter(lamp, 'Office', state({ search: 'lightbulb' }), emptyIndex)).toBe(true)
      expect(matchesFilter(lamp, 'Office', state({ search: 'acme' }), emptyIndex)).toBe(true)
    })

    it('does not match other fields', () => {
      expect(matchesFilter(lamp, 'Office', state({ search: 'serial' }), emptyIndex)).toBe(false)
    })

    it('ignores surrounding whitespace', () => {
      expect(matchesFilter(lamp, 'Office', state({ search: '  desk  ' }), emptyIndex)).toBe(true)
    })
  })

  it('matches rooms by name', () => {
    expect(matchesFilter(lamp, 'Office', state({
      rooms: ['Kitchen', 'Office'],
    }), emptyIndex)).toBe(true)
    expect(matchesFilter(lamp, 'Office', state({
      rooms: ['Kitchen'],
    }), emptyIndex)).toBe(false)
  })

  it('matches bridges by name or username', () => {
    const bridged = hap({ type: 'Switch', bridge: 'BRIDGE-USER' })
    bridged.instance = { ...bridged.instance, name: 'Main Bridge' }
    expect(matchesFilter(bridged, 'Office', state({
      bridges: ['Main Bridge'],
    }), emptyIndex)).toBe(true)
    expect(matchesFilter(bridged, 'Office', state({
      bridges: ['BRIDGE-USER'],
    }), emptyIndex)).toBe(true)
    expect(matchesFilter(bridged, 'Office', state({
      bridges: ['Other'],
    }), emptyIndex)).toBe(false)
  })

  it('matches a child bridge by the name it advertises', () => {
    const child = hap({ type: 'Switch', bridge: 'CHILD-USER' })
    child.instance = { ...child.instance, name: 'Kitchen Bridge' }
    expect(matchesFilter(child, 'Office', state({
      bridges: ['Kitchen Bridge'],
    }), emptyIndex)).toBe(true)
    expect(matchesFilter(child, 'Office', state({
      bridges: ['Homebridge'],
    }), emptyIndex)).toBe(false)
  })

  it('matches protocols', () => {
    expect(matchesFilter(lamp, 'Office', state({
      protocols: ['hap'],
    }), emptyIndex)).toBe(true)
    expect(matchesFilter(lamp, 'Office', state({
      protocols: ['matter'],
    }), emptyIndex)).toBe(false)
    expect(matchesFilter(matter({ deviceType: 'OnOffLight' }), 'Office', state({
      protocols: ['matter'],
    }), emptyIndex)).toBe(true)
  })

  it('matches categories, using any of the selected values', () => {
    expect(matchesFilter(lamp, 'Office', state({
      categories: ['lights'],
    }), emptyIndex)).toBe(true)
    expect(matchesFilter(lamp, 'Office', state({
      categories: ['climate', 'covers'],
    }), emptyIndex)).toBe(false)
    expect(matchesFilter(lamp, 'Office', state({
      categories: ['climate', 'lights'],
    }), emptyIndex)).toBe(true)
  })

  describe('states', () => {
    const off = hap({
      type: 'Switch',
      characteristics: [
        characteristic('On', false),
      ],
    })
    const broken = hap({
      type: 'Switch',
      characteristics: [
        characteristic('On', false, { status: -70408 }),
      ],
    })

    it('on matches services whose On or Active value is truthy', () => {
      expect(matchesFilter(lamp, 'Office', state({
        states: ['on'],
      }), emptyIndex)).toBe(true)
      expect(matchesFilter(off, 'Office', state({
        states: ['on'],
      }), emptyIndex)).toBe(false)
      const active = hap({
        type: 'Fan',
        characteristics: [
          characteristic('Active', 1),
        ],
      })
      expect(matchesFilter(active, 'Office', state({
        states: ['on'],
      }), emptyIndex)).toBe(true)
    })

    it('on uses the Matter active state', () => {
      const onMatter = matter({
        deviceType: 'OnOffPlugInUnit',
        clusters: {
          onOff: { onOff: true },
        },
      })
      expect(matchesFilter(onMatter, 'Office', state({
        states: ['on'],
      }), emptyIndex)).toBe(true)
    })

    it('notResponding matches services with a HAP error status', () => {
      expect(matchesFilter(broken, 'Office', state({
        states: ['notResponding'],
      }), emptyIndex)).toBe(true)
      expect(matchesFilter(off, 'Office', state({
        states: ['notResponding'],
      }), emptyIndex)).toBe(false)
    })

    it('combines state values with OR', () => {
      expect(matchesFilter(off, 'Office', state({
        states: ['on', 'notResponding'],
      }), emptyIndex)).toBe(false)
      expect(matchesFilter(broken, 'Office', state({
        states: ['on', 'notResponding'],
      }), emptyIndex)).toBe(true)
    })
  })

  describe('battery', () => {
    const sensor = hap({ type: 'MotionSensor', aid: 9, uniqueId: 'sensor' })
    const plain = hap({ type: 'MotionSensor', aid: 10, uniqueId: 'plain' })
    const index = buildBatteryIndex([
      sensor,
      plain,
      batteryService({ aid: 9, level: 15, low: true }),
    ])

    it('any requires a battery', () => {
      expect(matchesFilter(sensor, 'Office', state({
        battery: ['any'],
      }), index)).toBe(true)
      expect(matchesFilter(plain, 'Office', state({
        battery: ['any'],
      }), index)).toBe(false)
    })

    it('low, under20 and charging filter by reading', () => {
      expect(matchesFilter(sensor, 'Office', state({
        battery: ['low'],
      }), index)).toBe(true)
      expect(matchesFilter(sensor, 'Office', state({
        battery: ['under20'],
      }), index)).toBe(true)
      expect(matchesFilter(sensor, 'Office', state({
        battery: ['charging'],
      }), index)).toBe(false)
      expect(matchesFilter(plain, 'Office', state({
        battery: ['low'],
      }), index)).toBe(false)
    })

    it('under20 is false for a battery at 50 percent', () => {
      const healthy = new Map([
        [
          'sensor',
          { level: 50, low: false, charging: false },
        ],
      ])
      expect(matchesFilter(sensor, 'Office', state({
        battery: ['under20'],
      }), healthy)).toBe(false)
    })
  })

  it('requires every filter dimension to match', () => {
    expect(matchesFilter(lamp, 'Office', state({
      categories: ['lights'],
      rooms: ['Kitchen'],
    }), emptyIndex)).toBe(false)
    expect(matchesFilter(lamp, 'Office', state({
      categories: ['lights'],
      rooms: ['Office'],
      search: 'desk',
      states: ['on'],
    }), emptyIndex)).toBe(true)
  })
})

describe('groupAndSort', () => {
  const kitchenLight = hap({
    type: 'Lightbulb',
    customName: 'Ceiling',
    uniqueId: 'kl',
    characteristics: [
      characteristic('On', true),
    ],
  })
  const kitchenSwitch = hap({ type: 'Switch', customName: 'Kettle', uniqueId: 'ks' })
  const hallSensor = hap({
    type: 'ContactSensor',
    customName: 'Front Door',
    uniqueId: 'hs',
    aid: 3,
  })
  const hallLight = hap({
    type: 'Lightbulb',
    customName: 'Hall Lamp',
    uniqueId: 'hl',
    aid: 4,
    bridge: 'OTHER',
  })
  const rooms: RoomInput[] = [
    {
      name: 'Kitchen',
      services: [kitchenLight, kitchenSwitch],
    },
    {
      name: 'Hall',
      services: [hallSensor, hallLight],
    },
    { name: 'Garage', services: [] },
  ]

  it('keeps room order and layout order with the default state', () => {
    const groups = groupAndSort(rooms, state(), emptyIndex)
    expect(groups.map(g => [g.key, g.label])).toEqual([
      ['Kitchen', 'Kitchen'],
      ['Hall', 'Hall'],
      ['Garage', 'Garage'],
    ])
    expect(ids(groups)).toEqual([
      ['kl', 'ks'],
      ['hs', 'hl'],
      [],
    ])
  })

  it('drops empty rooms once a filter is active', () => {
    const groups = groupAndSort(rooms, state({
      categories: ['lights'],
    }), emptyIndex)
    expect(groups.map(g => g.key)).toEqual(['Kitchen', 'Hall'])
    expect(ids(groups)).toEqual([
      ['kl'],
      ['hl'],
    ])
  })

  it('groups by category in category order and drops empty categories', () => {
    const groups = groupAndSort(rooms, state({ groupBy: 'category' }), emptyIndex)
    expect(groups.map(g => g.key)).toEqual(['lights', 'switches', 'sensors'])
    expect(groups[0].label).toBe('accessories.categories.lights')
    expect(ids(groups)).toEqual([
      ['kl', 'hl'],
      ['ks'],
      ['hs'],
    ])
  })

  it('groups by bridge in first-seen order', () => {
    const groups = groupAndSort(rooms, state({ groupBy: 'bridge' }), emptyIndex)
    expect(groups.map(g => g.key)).toEqual(['AA:BB:CC:DD:EE:FF', 'OTHER'])
    expect(ids(groups)).toEqual([
      ['kl', 'ks', 'hs'],
      ['hl'],
    ])
  })

  it('returns one group for groupBy none, and none when nothing matches', () => {
    expect(groupAndSort(rooms, state({ groupBy: 'none' }), emptyIndex)).toEqual([
      {
        key: 'all',
        label: '',
        services: [
          kitchenLight,
          kitchenSwitch,
          hallSensor,
          hallLight,
        ],
      },
    ])
    expect(groupAndSort(rooms, state({ groupBy: 'none', search: 'nothing-matches' }), emptyIndex)).toEqual([])
  })

  it('sorts by name within each group', () => {
    const groups = groupAndSort(rooms, state({ sortBy: 'name' }), emptyIndex)
    expect(ids(groups)).toEqual([
      ['kl', 'ks'],
      ['hs', 'hl'],
      [],
    ])
    expect(groups[0].services.map(s => s.customName)).toEqual(['Ceiling', 'Kettle'])
    expect(groups[1].services.map(s => s.customName)).toEqual(['Front Door', 'Hall Lamp'])
  })

  it('sorts by category within each group', () => {
    const groups = groupAndSort([
      {
        name: 'Room',
        services: [kitchenSwitch, kitchenLight],
      },
    ], state({ sortBy: 'category' }), emptyIndex)
    expect(ids(groups)).toEqual([
      ['kl', 'ks'],
    ])
  })

  it('sorts across the whole list when grouped by none', () => {
    const groups = groupAndSort(rooms, state({ groupBy: 'none', sortBy: 'name' }), emptyIndex)
    expect(groups[0].services.map(s => s.customName)).toEqual([
      'Ceiling',
      'Front Door',
      'Hall Lamp',
      'Kettle',
    ])
  })

  describe('battery sort', () => {
    const low = hap({ type: 'MotionSensor', aid: 20, uniqueId: 'low' })
    const lowNoLevel = hap({ type: 'MotionSensor', aid: 21, uniqueId: 'lownolevel' })
    const mid = hap({ type: 'MotionSensor', aid: 22, uniqueId: 'mid' })
    const noBattery = hap({ type: 'MotionSensor', aid: 23, uniqueId: 'none' })
    const full = hap({ type: 'MotionSensor', aid: 24, uniqueId: 'full' })
    const index = new Map<string, { level?: number, low: boolean, charging: boolean }>([
      [
        'low',
        { level: 12, low: true, charging: false },
      ],
      [
        'lownolevel',
        { low: true, charging: false },
      ],
      [
        'mid',
        { level: 55, low: false, charging: false },
      ],
      [
        'full',
        { level: 95, low: false, charging: true },
      ],
    ])

    it('puts low-without-level first, then lowest level, then no level, then no battery last', () => {
      const groups = groupAndSort([
        {
          name: 'Room',
          services: [full, noBattery, mid, low, lowNoLevel],
        },
      ], state({ sortBy: 'battery' }), index)
      expect(ids(groups)).toEqual([
        [
          'lownolevel',
          'low',
          'mid',
          'full',
          'none',
        ],
      ])
    })
  })

  it('drops rooms with no matching services and does not mutate the input', () => {
    const original = [...rooms[0].services]
    groupAndSort(rooms, state({ sortBy: 'name' }), emptyIndex)
    expect(rooms[0].services).toEqual(original)
  })

  it('groups 500 services in under 50 ms', () => {
    const big: RoomInput[] = Array.from({ length: 10 }, (_, r) => ({
      name: `Room ${r}`,
      services: Array.from({ length: 50 }, (_, s) => hap({
        type: s % 3 === 0
          ? 'Lightbulb'
          : s % 3 === 1
            ? 'MotionSensor'
            : 'Switch',
        customName: `Accessory ${r}-${s}`,
        aid: r * 100 + s,
        uniqueId: `u-${r}-${s}`,
        characteristics: [
          characteristic('On', s % 2 === 0),
        ],
      })),
    }))
    const index = buildBatteryIndex(big.flatMap(r => r.services))
    const started = performance.now()
    const groups = groupAndSort(big, state({
      search: 'accessory',
      sortBy: 'battery',
      states: ['on'],
    }), index)
    const elapsed = performance.now() - started
    expect(groups.length).toBe(10)
    expect(elapsed).toBeLessThan(50)
  })
})

describe('labels', () => {
  const lamp = hap({ type: 'Lightbulb', customName: 'Lamp', uniqueId: 'lamp' })
  const fan = hap({ type: 'Fan', customName: 'Fan', uniqueId: 'fan' })
  const labels = new Map([
    [
      'lamp',
      ['Bedtime', 'Guest'],
    ],
    [
      'fan',
      ['Guest'],
    ],
  ])

  it('counts a label as an active filter', () => {
    expect(isFilterActive(state({
      labels: ['Guest'],
    }))).toBe(true)
    expect(isFilterActive(state())).toBe(false)
  })

  it('matches a service carrying any selected label', () => {
    expect(matchesFilter(lamp, 'Kitchen', state({
      labels: ['Bedtime'],
    }), emptyIndex, { labels })).toBe(true)
    expect(matchesFilter(fan, 'Kitchen', state({
      labels: ['Bedtime'],
    }), emptyIndex, { labels })).toBe(false)
    expect(matchesFilter(fan, 'Kitchen', state({
      labels: ['Bedtime', 'Guest'],
    }), emptyIndex, { labels })).toBe(true)
  })

  it('matches nothing with a label filter and no label index', () => {
    expect(matchesFilter(lamp, 'Kitchen', state({
      labels: ['Guest'],
    }), emptyIndex)).toBe(false)
  })
})

describe('groupBy floor', () => {
  const kitchenLamp = hap({ type: 'Lightbulb', customName: 'Kitchen Lamp', uniqueId: 'kl' })
  const hallSwitch = hap({ type: 'Switch', customName: 'Hall Switch', uniqueId: 'hs' })
  const shedFan = hap({ type: 'Fan', customName: 'Shed Fan', uniqueId: 'sf' })
  const rooms = [
    {
      name: 'Kitchen',
      services: [kitchenLamp],
    },
    {
      name: 'Hall',
      services: [hallSwitch],
    },
    {
      name: 'Shed',
      services: [shedFan],
    },
  ]

  it('builds one group per floor in saved order, with the rooms on no floor last under Other', () => {
    const groups = groupAndSort(rooms, state({ groupBy: 'floor' }), emptyIndex, {
      floors: [
        {
          name: 'Upstairs',
          rooms: ['Hall'],
        },
        {
          name: 'Ground',
          rooms: ['Kitchen'],
        },
      ],
    })
    expect(groups.map(group => group.label)).toEqual(['Upstairs', 'Ground', 'accessories.floors.other'])
    expect(groups.map(group => group.key)).toEqual(['floor:Upstairs', 'floor:Ground', FLOOR_OTHER_KEY])
    expect(ids(groups)).toEqual([
      ['hs'],
      ['kl'],
      ['sf'],
    ])
  })

  it('drops empty floors and the Other group when it has nothing in it', () => {
    const groups = groupAndSort(rooms, state({ groupBy: 'floor' }), emptyIndex, {
      floors: [
        { name: 'Empty', rooms: [] },
        {
          name: 'Ground',
          rooms: ['Kitchen', 'Hall', 'Shed'],
        },
      ],
    })
    expect(groups.map(group => group.label)).toEqual(['Ground'])
  })

  it('puts every room under Other when there are no floors', () => {
    const groups = groupAndSort(rooms, state({ groupBy: 'floor' }), emptyIndex)
    expect(groups).toHaveLength(1)
    expect(groups[0].key).toBe(FLOOR_OTHER_KEY)
    expect(ids(groups)).toEqual([
      ['kl', 'hs', 'sf'],
    ])
  })

  it('keeps a room on its first floor when it is listed twice', () => {
    const groups = groupAndSort(rooms, state({ groupBy: 'floor' }), emptyIndex, {
      floors: [
        {
          name: 'A',
          rooms: ['Kitchen'],
        },
        {
          name: 'B',
          rooms: ['Kitchen'],
        },
      ],
    })
    expect(groups.map(group => group.label)).toEqual(['A', 'accessories.floors.other'])
  })
})

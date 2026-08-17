import type { Plugin } from '@/app/core/plugins/manage-plugins.interfaces'

import { describe, expect, it } from 'vitest'

import { PluginsComponent } from '@/app/modules/plugins/plugins.component'
import { makePlugin, makeSettings } from '@/testing'

/**
 * `sortPlugins` reads only `this.$settings.env`, so it is called off the
 * prototype with a hand-built context rather than by booting the whole plugins
 * page. The page's own behaviour is covered by its component spec later.
 * @param plugins - the list to sort
 * @param env - the settings env fields the sort depends on
 */
function sortPlugins(plugins: Plugin[], env: Record<string, any> = {}): Plugin[] {
  const context = { $settings: makeSettings({ env }) }
  return (PluginsComponent.prototype as any).sortPlugins.call(context, plugins)
}

/**
 * A plugin whose name says what makes it interesting, so a failed assertion
 * reads as an order of concepts rather than an order of strings.
 * @param name - the plugin name
 * @param traits - the sort-relevant flags
 */
function plugin(name: string, traits: Partial<Plugin> = {}): Plugin {
  return makePlugin({ name, isConfigured: false, ...traits })
}

describe('PluginsComponent', () => {
  describe('sortPlugins', () => {
    it('puts an available update above everything else', () => {
      const sorted = sortPlugins([
        plugin('plain'),
        plugin('scoped', { newHbScope: { from: 'a', switch: 'b', to: 'c' } }),
        plugin('updatable', { updateAvailable: true }),
      ])

      expect(sorted.map(x => x.name)).toEqual(['updatable', 'scoped', 'plain'])
    })

    it('sinks disabled and configured plugins', () => {
      const sorted = sortPlugins([
        plugin('configured', { isConfigured: true }),
        plugin('disabled', { disabled: true }),
        plugin('plain'),
      ])

      expect(sorted.map(x => x.name)).toEqual(['plain', 'disabled', 'configured'])
    })

    it('lifts a plugin whose child bridges are unpaired', () => {
      const sorted = sortPlugins([
        plugin('paired'),
        plugin('unpaired', { hasChildBridgesUnpaired: true }),
      ])

      expect(sorted.map(x => x.name)).toEqual(['unpaired', 'paired'])
    })

    it('falls back to the name when two plugins score the same', () => {
      const sorted = sortPlugins([plugin('zebra'), plugin('apple'), plugin('mango')])

      expect(sorted.map(x => x.name)).toEqual(['apple', 'mango', 'zebra'])
    })

    it('leaves the original array alone', () => {
      const plugins = [plugin('zebra'), plugin('apple')]

      sortPlugins(plugins)

      expect(plugins.map(x => x.name)).toEqual(['zebra', 'apple'])
    })

    describe('the child bridge nudge', () => {
      it('sinks a plugin that already runs on a child bridge', () => {
        const sorted = sortPlugins(
          [plugin('a-on-bridge', { hasChildBridges: true }), plugin('b-needs-bridge')],
          { recommendChildBridges: true },
        )

        expect(sorted.map(x => x.name)).toEqual(['b-needs-bridge', 'a-on-bridge'])
      })

      it('sinks a plugin the user opted out of the nudge', () => {
        const sorted = sortPlugins(
          [plugin('a-opted-out'), plugin('b-needs-bridge')],
          { recommendChildBridges: true, plugins: { hideChildBridgeSetupFor: ['a-opted-out'] } },
        )

        expect(sorted.map(x => x.name)).toEqual(['b-needs-bridge', 'a-opted-out'])
      })

      it('stops nudging entirely when recommendations are switched off', () => {
        const sorted = sortPlugins(
          [plugin('a-on-bridge', { hasChildBridges: true }), plugin('b-needs-bridge')],
          { recommendChildBridges: false },
        )

        expect(sorted.map(x => x.name)).toEqual(['a-on-bridge', 'b-needs-bridge'])
      })
    })

    describe('the scoring quirks', () => {
      it('lets an update outweigh every negative combined', () => {
        const sorted = sortPlugins([
          plugin('clean'),
          plugin('awful-but-updatable', {
            updateAvailable: true,
            disabled: true,
            isConfigured: true,
            hasChildBridges: true,
          }),
        ], { recommendChildBridges: true })

        expect(sorted[0].name).toBe('awful-but-updatable')
      })

      it('ranks a configured plugin below a disabled one', () => {
        // -20 for configured against -10 for disabled. A working, set-up plugin
        // sinking below a switched-off one reads oddly, but it is deliberate:
        // the list is ordered by what still needs attention
        const sorted = sortPlugins([plugin('a-configured', { isConfigured: true }), plugin('b-disabled', { disabled: true })])

        expect(sorted.map(x => x.name)).toEqual(['b-disabled', 'a-configured'])
      })
    })
  })
})

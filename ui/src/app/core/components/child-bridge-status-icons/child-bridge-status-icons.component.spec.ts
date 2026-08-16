import type { FakeSettings } from '@/testing'

import { TestBed } from '@angular/core/testing'
import { describe, expect, it } from 'vitest'

import { ChildBridgeIconSource, ChildBridgeStatusIconsComponent } from '@/app/core/components/child-bridge-status-icons/child-bridge-status-icons.component'
import { HomebridgeStatus } from '@/app/core/server.interfaces'
import { makeSettings } from '@/testing'
import { provideFakes, provideTestTranslate } from '@/testing/providers'

/**
 * The HAP and Matter icons for one child bridge, extracted from the bridges
 * widget so Update All's post-run restart list shows a bridge the same way.
 *
 * The colours are the whole point: the same icon means "off", "externals
 * only", "not running" or "running" depending on config whose spelling
 * changed between Homebridge versions, and on feature flags. Getting it wrong
 * tells the user a working bridge is broken. The widget's own spec renders
 * with NO_ERRORS_SCHEMA and never asserted any of this, so these tests are
 * the guard.
 */
describe('childBridgeStatusIconsComponent', () => {
  let settings: FakeSettings

  const allFlags = { matterSupport: true, hapBridgeDisable: true, protocolExternalsOnly: true }

  /**
   * Render the icons for one bridge.
   * @param bridge - the bridge state to render
   * @param featureFlags - the feature flags to enable
   * @param serverRestarting - whether the whole server is restarting
   */
  function render(bridge: ChildBridgeIconSource, featureFlags: Record<string, boolean> = allFlags, serverRestarting = false) {
    // Reset here rather than in beforeEach: one test renders twice, to cover
    // both spellings of a disabled HAP bridge in a single assertion block.
    TestBed.resetTestingModule()
    settings = makeSettings({ env: { featureFlags } })
    TestBed.configureTestingModule({
      imports: [ChildBridgeStatusIconsComponent],
      providers: [...provideFakes({ settings }), provideTestTranslate()],
    })
    const fixture = TestBed.createComponent(ChildBridgeStatusIconsComponent)
    fixture.componentRef.setInput('bridge', bridge)
    fixture.componentRef.setInput('serverRestarting', serverRestarting)
    fixture.detectChanges()
    return fixture
  }

  /**
   * The classes on one of the two icons.
   * @param fixture - the rendered fixture
   * @param which - hap or matter
   */
  function classesOf(fixture: ReturnType<typeof render>, which: 'hap' | 'matter'): string[] {
    const el = fixture.nativeElement.querySelector(`.fa-${which}`)
    return el ? [...el.classList] : []
  }

  it('shows a running bridge in green on both protocols', () => {
    const fixture = render({ status: HomebridgeStatus.OK, matterConfig: { enabled: true } })
    expect(classesOf(fixture, 'hap')).toContain('green-text')
    expect(classesOf(fixture, 'matter')).toContain('green-text')
  })

  it('shows a restarting bridge in amber, not green or red', () => {
    const fixture = render({ status: HomebridgeStatus.OK, restarting: true, matterConfig: { enabled: true } })
    expect(classesOf(fixture, 'hap')).toContain('text-warning')
    expect(classesOf(fixture, 'hap')).not.toContain('green-text')
    expect(classesOf(fixture, 'hap')).not.toContain('red-text')
  })

  it('treats a whole-server restart as a transition for every bridge', () => {
    const fixture = render({ status: HomebridgeStatus.DOWN }, allFlags, true)
    expect(classesOf(fixture, 'hap')).toContain('text-warning')
    expect(classesOf(fixture, 'hap')).not.toContain('red-text')
  })

  it('shows a down bridge in red', () => {
    const fixture = render({ status: HomebridgeStatus.DOWN, matterConfig: { enabled: true } })
    expect(classesOf(fixture, 'hap')).toContain('red-text')
    expect(classesOf(fixture, 'matter')).toContain('red-text')
  })

  it('mutes HAP when disabled, in both the legacy boolean and object spellings', () => {
    for (const hap of [false as const, { enabled: false }]) {
      const fixture = render({ status: HomebridgeStatus.OK, hap })
      expect(classesOf(fixture, 'hap')).toContain('grey-text')
      expect(classesOf(fixture, 'hap')).toContain('opacity-muted')
      expect(classesOf(fixture, 'hap')).not.toContain('green-text')
    }
  })

  it('ignores a disabled HAP flag when the runtime does not support disabling', () => {
    const fixture = render({ status: HomebridgeStatus.OK, hap: { enabled: false } }, { matterSupport: true })
    expect(classesOf(fixture, 'hap')).toContain('green-text')
    expect(classesOf(fixture, 'hap')).not.toContain('opacity-muted')
  })

  it('marks externals-only with the info colour rather than green', () => {
    const fixture = render({ status: HomebridgeStatus.OK, hap: { externalsOnly: true }, matterConfig: { enabled: true, externalsOnly: true } })
    expect(classesOf(fixture, 'hap')).toContain('text-info')
    expect(classesOf(fixture, 'hap')).not.toContain('green-text')
    expect(classesOf(fixture, 'matter')).toContain('text-info')
  })

  it('mutes Matter when there is no matterConfig at all', () => {
    const fixture = render({ status: HomebridgeStatus.OK })
    expect(classesOf(fixture, 'matter')).toContain('grey-text')
    expect(classesOf(fixture, 'matter')).toContain('opacity-muted')
  })

  it('omits the Matter icon entirely when the runtime does not support Matter', () => {
    const fixture = render({ status: HomebridgeStatus.OK, matterConfig: { enabled: true } }, { hapBridgeDisable: true })
    expect(fixture.nativeElement.querySelector('.fa-matter')).toBeNull()
    expect(fixture.nativeElement.querySelector('.fa-hap')).not.toBeNull()
  })
})

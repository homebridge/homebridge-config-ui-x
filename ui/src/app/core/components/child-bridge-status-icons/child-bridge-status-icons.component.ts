import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core'
import { NgbTooltip } from '@ng-bootstrap/ng-bootstrap/tooltip'
import { TranslatePipe } from '@ngx-translate/core'

import { ChildBridgeStatusResponse } from '@/app/core/server.interfaces'
import { SettingsService } from '@/app/core/ui/settings.service'

/** Just the parts of a child bridge these icons read - so a caller holding a partial record can still use them */
export type ChildBridgeIconSource = Pick<ChildBridgeStatusResponse, 'status' | 'hap' | 'matterConfig'> & {
  restarting?: boolean
}

/**
 * The HAP and Matter status icons for a single child bridge, with the colour
 * and tooltip vocabulary the bridges widget established: green running, amber
 * restarting or pending, red down, muted grey disabled, info externals-only.
 *
 * Extracted so the bridges widget and Update All's post-run restart list show
 * one bridge the same way, rather than each carrying its own copy of these
 * rules and drifting.
 */
@Component({
  selector: 'app-child-bridge-status-icons',
  imports: [NgbTooltip, TranslatePipe],
  standalone: true,
  templateUrl: './child-bridge-status-icons.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChildBridgeStatusIconsComponent {
  private $settings = inject(SettingsService)

  public readonly bridge = input.required<ChildBridgeIconSource>()
  /** A whole-Homebridge restart puts every bridge in transition, whatever its own flag says */
  public readonly serverRestarting = input(false)

  public readonly isMatterSupported = this.$settings.isFeatureEnabled('matterSupport')
  private readonly isHapBridgeDisableSupported = this.$settings.isFeatureEnabled('hapBridgeDisable')
  private readonly isProtocolExternalsOnlyEnabled = this.$settings.isFeatureEnabled('protocolExternalsOnly')

  public readonly inTransition = computed(() => {
    const bridge = this.bridge()
    return bridge.status === 'pending' || !!bridge.restarting || this.serverRestarting()
  })

  public readonly isDown = computed(() => this.bridge().status === 'down' && !this.inTransition())
  public readonly isUp = computed(() => this.bridge().status === 'ok' && !this.inTransition())

  /** Tolerates both the legacy boolean `hap` and the nested object form */
  public readonly hapDisabled = computed(() => {
    if (!this.isHapBridgeDisableSupported) {
      return false
    }
    const hap = this.bridge().hap
    if (hap === false) {
      return true
    }
    return typeof hap === 'object' && hap !== null && hap.enabled === false
  })

  public readonly hapExternalsOnly = computed(() => {
    if (!this.isProtocolExternalsOnlyEnabled) {
      return false
    }
    const hap = this.bridge().hap
    return typeof hap === 'object' && hap !== null && hap.externalsOnly === true
  })

  public readonly matterExternalsOnly = computed(
    () => this.isProtocolExternalsOnlyEnabled && this.bridge().matterConfig?.externalsOnly === true,
  )

  /** Matches the widget exactly: no matterConfig at all means Matter is not configured for this bridge */
  public readonly matterEnabled = computed(() => {
    const matterConfig = this.bridge().matterConfig
    return !!matterConfig && matterConfig.enabled !== false
  })

  public readonly hapTooltipKey = computed(() => {
    if (this.hapExternalsOnly()) {
      return 'status.services.hap_externals_only'
    }
    if (this.hapDisabled()) {
      return 'status.services.hap_not_enabled'
    }
    return this.isDown() ? 'status.services.hap_not_running' : 'status.services.hap_running'
  })

  public readonly matterTooltipKey = computed(() => {
    if (this.matterExternalsOnly()) {
      return 'status.services.matter_externals_only'
    }
    if (!this.matterEnabled()) {
      return 'status.services.matter_not_enabled'
    }
    return this.isDown() ? 'status.services.matter_not_running' : 'status.services.matter_running'
  })
}

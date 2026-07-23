import type { DeviceInfo } from '@/app/core/plugins/manage-plugins.interfaces'
import type { BridgeConfig } from '@/app/core/settings.interfaces'

import type { PluginBridgeAccessoryLink, PluginBridgeDeleteBridge, PluginBridgeMatterBridge } from './plugin-bridge.interfaces'

import { ChangeDetectionStrategy, Component, inject, OnInit, signal } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { Router } from '@angular/router'
import { NgbAlert } from '@ng-bootstrap/ng-bootstrap/alert'
import { NgbActiveModal, NgbModal } from '@ng-bootstrap/ng-bootstrap/modal'
import { TranslatePipe, TranslateService } from '@ngx-translate/core'
import { ToastrService } from 'ngx-toastr'

import { ApiService } from '@/app/core/communication/api.service'
import { QrcodeComponent } from '@/app/core/components/qrcode/qrcode.component'
import { RestartHomebridgeComponent } from '@/app/core/components/restart-homebridge/restart-homebridge.component'
import { PLUGIN_BRIDGE_MODAL_DATA } from '@/app/core/modal-data-tokens'
import { Plugin } from '@/app/core/plugins/manage-plugins.interfaces'
import { ManagePluginsService } from '@/app/core/plugins/manage-plugins.service'
import {
  RE_COLON,
  RE_CONSECUTIVE_DASHES,
  RE_HAP_NAME_PATTERN,
  RE_INVALID_HAP_NAME_CHARS,
  RE_LEADING_TRAILING_DASH,
  RE_LEADING_TRAILING_NON_ALNUM_UNICODE,
  RE_LEADING_TRAILING_SPACE_APOSTROPHE,
  RE_NON_ALNUM,
} from '@/app/core/regex.constants'
import { SettingsService } from '@/app/core/ui/settings.service'
import { ChildBridgesService } from '@/app/core/utilities/child-bridges.service'

@Component({
  selector: 'app-plugin-bridge',
  imports: [
    FormsModule,
    NgbAlert,
    QrcodeComponent,
    TranslatePipe,
  ],
  standalone: true,
  templateUrl: './plugin-bridge.component.html',
  styleUrl: './plugin-bridge.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PluginBridgeComponent implements OnInit {
  // 1. Injected Dependencies
  private $activeModal = inject(NgbActiveModal)
  private $api = inject(ApiService)
  private $childBridges = inject(ChildBridgesService)
  private $modal = inject(NgbModal)
  private $plugin = inject(ManagePluginsService)
  private $router = inject(Router)
  private $settings = inject(SettingsService)
  private $toastr = inject(ToastrService)
  private $translate = inject(TranslateService)
  private modalData = inject(PLUGIN_BRIDGE_MODAL_DATA)

  // 2. Public properties (from injected data)
  public plugin = this.modalData.plugin
  public schema = this.modalData.schema
  public justInstalled = this.modalData.justInstalled ?? false
  private editorContext = this.modalData.editorContext

  // 3. Signals
  public readonly loading = signal(true)
  public readonly canConfigure = signal(true)
  public readonly saveInProgress = signal(false)
  public readonly configBlocks = signal<any[]>([])
  public readonly selectedBlock = signal<string>('0')
  public readonly isPlatform = signal<boolean>(false)
  public readonly enabledBlocks = signal<Record<number, boolean>>({})
  public readonly hapEnabledBlocks = signal<Record<number, boolean>>({})
  public readonly matterEnabledBlocks = signal<Record<number, boolean>>({})
  public readonly showAdvanced = signal(false)
  public readonly globalDebug = signal<string>('')
  public readonly globalNodeOptions = signal<string>('')
  public readonly hideChildBridgeSetup = signal<boolean>(false)

  // 6. Other Properties
  private matterExplicitlyDisabledBeforeChildBridge: Set<number> = new Set()
  private bridgeConfigs = new Map<string, BridgeConfig>()
  private originalScheduledRestartCrons = new Map<string, string | null>()
  private originalHideAlerts = new Map<string, { hideHapAlert?: boolean, hideMatterAlert?: boolean }>()
  private originalHideChildBridgeSetup = false
  public readonly bridgeCache = signal<Map<number, Record<string, any>>>(new Map())
  public readonly originalBridges = signal<any[]>([])
  public readonly deviceInfo = signal<Map<string, DeviceInfo | false>>(new Map())
  public readonly matterBridgeCache = signal<Map<number, Record<string, any>>>(new Map())
  public readonly originalMatterBridges = signal<any[]>([])
  public readonly matterDeviceInfo = signal<Map<string, any>>(new Map())
  public readonly deleteMatterBridges = signal<PluginBridgeMatterBridge[]>([])
  public readonly canShowBridgeDebug = signal<boolean>(false)
  public readonly deleteBridges = signal<PluginBridgeDeleteBridge[]>([])
  public readonly deletingPairedBridge = signal<boolean>(false)
  public readonly accessoryBridgeLinks = signal<PluginBridgeAccessoryLink[]>([])
  public readonly bridgesAvailableForLink = signal<PluginBridgeAccessoryLink[]>([])
  public readonly currentlySelectedLink = signal<PluginBridgeAccessoryLink | null>(null)
  public readonly currentBridgeHasLinks = signal<boolean>(false)
  public isMatterSupported = this.$settings.isFeatureEnabled('matterSupport')
  // When false (older Homebridge), at least one of HAP/Matter must stay enabled.
  public allowDisableAllProtocols = this.$settings.isFeatureEnabled('disableAllProtocols')
  // When true (Homebridge >= 2.0.3-beta.22), disabling Matter on a child bridge
  // is non-destructive (_bridge.matter.enabled=false, storage kept).
  public allowMatterDisableInPlace = this.$settings.isFeatureEnabled('matterDisableInPlace')
  // When true (Homebridge >= 2.0.3-beta.26), HAP config uses the nested object
  // form (`{ enabled?, externalsOnly? }`) and both HAP and Matter expose an
  // externalsOnly toggle that suppresses the bridge accessory/node itself
  // while still allowing plugins to publish external accessories.
  public isProtocolExternalsOnlyEnabled = this.$settings.isFeatureEnabled('protocolExternalsOnly')
  // Tracks whether HAP externalsOnly is set, keyed by block index. Only meaningful
  // when isProtocolExternalsOnlyEnabled is true and HAP is disabled for the block.
  public readonly hapExternalsOnlyBlocks = signal<Record<number, boolean>>({})
  // When true (Homebridge >= 2.2.2-beta.0), HAP exposes a toggle that disables
  // username-derived identifying material in bridge and mDNS service names.
  public isHapDisableIdentifyingMaterialEnabled = this.$settings.isFeatureEnabled('hapDisableIdentifyingMaterial')
  // Tracks whether HAP disableIdentifyingMaterial is set, keyed by block index.
  public readonly hapDisableIdentifyingMaterialBlocks = signal<Record<number, boolean>>({})
  // Tracks whether Matter externalsOnly is set, keyed by block index. Only meaningful
  // when isProtocolExternalsOnlyEnabled is true and Matter is disabled for the block.
  public readonly matterExternalsOnlyBlocks = signal<Record<number, boolean>>({})
  // When true (Homebridge >= 2.2.0), Matter exposes a disableIpv4 toggle that
  // makes the Matter mDNS responder IPv6-only.
  public isMatterDisableIpv4Enabled = this.$settings.isFeatureEnabled('matterDisableIpv4')
  // Tracks whether Matter disableIpv4 is set, keyed by block index. Only
  // meaningful when isMatterDisableIpv4Enabled is true and Matter is enabled.
  public readonly matterDisableIpv4Blocks = signal<Record<number, boolean>>({})
  public readonly defaultIcon = 'assets/hb-icon.png'
  public readonly linkChildBridges = '<a href="https://github.com/homebridge/homebridge/wiki/Child-Bridges" target="_blank"><i class="fas fa-external-link-alt primary-text"></i></a>'
  public readonly linkDebug = '<a href="https://github.com/homebridge/homebridge-config-ui-x/wiki/Debug-Common-Values" target="_blank"><i class="fas fa-up-right-from-square primary-text"></i></a>'
  public readonly linkCron = '<a href="https://crontab.guru/" target="_blank" rel="noopener noreferrer"><i class="fas fa-up-right-from-square primary-text"></i></a>'

  // 7. Lifecycle Hooks
  public ngOnInit(): void {
    void this.initialize()
  }

  // 8. Public Methods
  public handleIconError(): void {
    if (this.plugin) {
      this.plugin.icon = this.defaultIcon
    }
  }

  public onBlockChange(index: string): void {
    this.selectedBlock.set(index)
    const configBlocks = this.configBlocks()
    const enabledBlocks = this.enabledBlocks()

    this.currentlySelectedLink.set(this.accessoryBridgeLinks().find(link => link.index === index) || null)
    this.currentBridgeHasLinks.set(this.accessoryBridgeLinks().some(link => link.usesIndex === index))

    // Build bridges available for link
    const availableBridges: PluginBridgeAccessoryLink[] = []

    // Bridges available for link can only be accessory blocks
    if (configBlocks[Number(index)].accessory) {
      for (const [i, bridge] of this.bridgeCache().entries()) {
        // Only include bridges that are enabled and not marked for deletion
        if (enabledBlocks[i] && !this.deleteBridges().some(b => b.id === bridge.username)) {
          if (i < Number(index)) {
            availableBridges.push({
              index: i.toString(),
              usesIndex: index,
              name: bridge.name,
              port: bridge.port,
              username: bridge.username,
            })
          }
        }
      }
    }

    this.bridgesAvailableForLink.set(availableBridges)
  }

  public onLinkBridgeChange(username: string): void {
    if (username) {
      const configBlocks = this.configBlocks()
      const selectedBlock = this.selectedBlock()

      // Get the index of the first block in the config with this bridge username
      const index = configBlocks.findIndex(block => block._bridge?.username === username)

      // Update the accessoryBridgeLinks
      this.accessoryBridgeLinks.update(current => [...current, {
        index: selectedBlock,
        usesIndex: index.toString(),
        name: this.bridgeCache().get(index)?.name,
        port: this.bridgeCache().get(index)?.port,
        username,
      }])

      // Update currently selected link
      this.currentlySelectedLink.set(this.accessoryBridgeLinks().find(link => link.index === selectedBlock) || null)
      this.enabledBlocks.update(current => ({ ...current, [Number(selectedBlock)]: true }))
      // Linked accessory blocks always ride HAP on the shared bridge (Matter is
      // platform-only), so mark HAP enabled — otherwise the save-time
      // "at least one protocol" guard wrongly rejects the linked block.
      this.hapEnabledBlocks.update(current => ({ ...current, [Number(selectedBlock)]: true }))

      // Update this block with the bridge details
      const block = configBlocks[Number(selectedBlock)]
      block._bridge = {
        username,
      }
    }
  }

  // 9. Private Methods
  private async initialize(): Promise<void> {
    try {
      await Promise.all([this.getPluginType(), this.loadPluginConfig(), this.loadBridgeConfigs(), this.loadGlobalStartupSettings()])
      this.canShowBridgeDebug.set(this.$settings.isFeatureEnabled('childBridgeDebugMode'))
      const initialHideSetup = !!this.plugin && !!this.$settings.env.plugins?.hideChildBridgeSetupFor?.includes(this.plugin.name)
      this.hideChildBridgeSetup.set(initialHideSetup)
      this.originalHideChildBridgeSetup = initialHideSetup
    } catch (error) {
      console.error('Failed to initialize:', error)
      const message = error instanceof Error ? error.message : 'Failed to initialize component'
      this.$toastr.error(message, this.$translate.instant('toast.title_error'))
    } finally {
      this.loading.set(false)
    }
  }

  private async getPluginType(): Promise<void> {
    const plugin = this.plugin
    if (!plugin) {
      return
    }

    try {
      const alias = this.editorContext?.alias
        ? this.editorContext.alias
        : await this.$api.get(`/plugins/alias/${encodeURIComponent(plugin.name)}`)
      this.isPlatform.set(alias.pluginType === 'platform')
    } catch (error) {
      console.error(error)
      const message = error instanceof Error ? error.message : 'Failed to load plugin type'
      this.$toastr.error(message, this.$translate.instant('toast.title_error'))
      this.$activeModal.close()
    }
  }

  private async loadPluginConfig(): Promise<void> {
    const plugin = this.plugin
    if (!plugin) {
      return
    }

    try {
      const loadedConfigBlocks: any[] = this.editorContext?.config
        ?? await this.$api.get(`/config-editor/plugin/${encodeURIComponent(plugin.name)}`)
      this.configBlocks.set(loadedConfigBlocks)

      for (const [i, block] of loadedConfigBlocks.entries()) {
        if (block._bridge) {
          this.enabledBlocks.update(current => ({ ...current, [i]: true }))

          // HAP is enabled by default. Two shapes are tolerated:
          //   - Legacy boolean: `_bridge.hap === false` means disabled.
          //   - Nested object: `_bridge.hap.enabled === false` means disabled,
          //     and `_bridge.hap.externalsOnly === true` is also surfaced.
          // Accessory child bridges cannot disable HAP (no Matter alternative)
          // and never have externalsOnly meaning. They may still customize
          // identifying material through the nested HAP object.
          const hap = block._bridge.hap
          let hapEnabled = true
          let hapExternalsOnly = false
          if (!block.accessory) {
            if (hap === false) {
              hapEnabled = false
            } else if (typeof hap === 'object' && hap !== null) {
              hapEnabled = hap.enabled !== false
              hapExternalsOnly = hap.externalsOnly === true
            }
          }
          this.hapEnabledBlocks.update(current => ({ ...current, [i]: hapEnabled }))
          if (this.isProtocolExternalsOnlyEnabled) {
            this.hapExternalsOnlyBlocks.update(current => ({ ...current, [i]: hapExternalsOnly }))
          }
          if (this.isHapDisableIdentifyingMaterialEnabled) {
            this.hapDisableIdentifyingMaterialBlocks.update(current => ({
              ...current,
              [i]: typeof hap === 'object' && hap !== null && hap.disableIdentifyingMaterial === true,
            }))
          }
        }

        if (block._bridge && block._bridge.username) {
          // For accessory plugin blocks, the username might be the same as a previous block
          const existingBridgeEntry = [...this.bridgeCache().entries()].find(([, bridge]) => bridge.username === block._bridge.username)
          const existingBridgeIndex = existingBridgeEntry ? existingBridgeEntry[0] : -1
          const existingBridge = existingBridgeEntry ? existingBridgeEntry[1] : undefined
          if (existingBridge) {
            block._bridge.env = {}
            this.accessoryBridgeLinks.update(current => [...current, {
              index: i.toString(),
              usesIndex: existingBridgeIndex.toString(),
              name: existingBridge.name,
              port: existingBridge.port,
              username: block._bridge.username,
            }])
          } else {
            block._bridge.env = block._bridge.env || {}
            this.bridgeCache.update(current => new Map(current).set(i, block._bridge))
            await this.getDeviceInfo(block._bridge.username)

            // If the bridge does not have a name in the config, then override it from the pairing
            if (!block._bridge.name) {
              const info = this.deviceInfo().get(block._bridge.username)
              if (info) {
                block._bridge.name = info.displayName
              }
            }
            // Deep clone the bridge config to track original state
            this.originalBridges.update(current => [...current, JSON.parse(JSON.stringify(block._bridge))])
          }
        }

        // Check for Matter bridge configuration
        // Matter is enabled if the matter object exists (not null/undefined)
        if (block._bridge && block._bridge.matter) {
          // Matter is only supported for platform-based plugins
          if (block.accessory) {
            // Strip Matter config from accessory-based plugins
            delete block._bridge.matter
          } else {
            // A block with `enabled: false` is the in-place disabled state — the
            // toggle shows off, but the port + commissioning storage are kept.
            const matterEnabled = !this.allowMatterDisableInPlace || block._bridge.matter.enabled !== false
            this.matterEnabledBlocks.update(current => ({ ...current, [i]: matterEnabled }))
            // externalsOnly is only meaningful on the new homebridge runtime
            // (>= 2.0.3-beta.26) and only when matter is disabled (validation
            // requires enabled: false alongside externalsOnly: true).
            if (this.isProtocolExternalsOnlyEnabled) {
              this.matterExternalsOnlyBlocks.update(current => ({
                ...current,
                [i]: block._bridge.matter.externalsOnly === true,
              }))
            }
            if (this.isMatterDisableIpv4Enabled) {
              this.matterDisableIpv4Blocks.update(current => ({
                ...current,
                [i]: block._bridge.matter.disableIpv4 === true,
              }))
            }

            // Only cache port + disableIpv4 - name is now shared at _bridge level
            this.matterBridgeCache.update(current => new Map(current).set(i, { port: block._bridge.matter.port, disableIpv4: block._bridge.matter.disableIpv4 === true }))
            this.originalMatterBridges.update(current => [...current, { port: block._bridge.matter.port }])
            // Use username as key, just like HAP
            if (block._bridge.username) {
              await this.getMatterCommissioningInfo(block._bridge.username)
            }
          }
        }
      }

      // If the plugin has just been installed, and there are no existing bridges, enable all blocks
      if (this.justInstalled && this.bridgeCache().size === 0) {
        loadedConfigBlocks.forEach((block: any, index: number) => {
          this.enabledBlocks.update(current => ({ ...current, [index]: true }))
          void this.toggleExternalBridge(block, true, index.toString())
        })
      }

      // Check if the currently selected bridge has any links
      const currentBridgeLinks = this.accessoryBridgeLinks().find(link => link.username === this.bridgeCache().get(Number(this.selectedBlock()))?.username)
      if (currentBridgeLinks) {
        this.currentBridgeHasLinks.set(true)
      }

      // Initialize the currently selected link
      const selectedBlock = this.selectedBlock()
      const enabledBlocks = this.enabledBlocks()
      this.currentlySelectedLink.set(this.accessoryBridgeLinks().find(link => link.index === selectedBlock) || null)

      // Initialize bridges available for link
      const availableBridges: PluginBridgeAccessoryLink[] = []
      if (loadedConfigBlocks[Number(selectedBlock)]?.accessory) {
        for (const [i, bridge] of this.bridgeCache().entries()) {
          if (enabledBlocks[i] && !this.deleteBridges().some(b => b.id === bridge.username)) {
            if (i < Number(selectedBlock)) {
              availableBridges.push({
                index: i.toString(),
                usesIndex: selectedBlock,
                name: bridge.name,
                port: bridge.port,
                username: bridge.username,
              })
            }
          }
        }
      }
      this.bridgesAvailableForLink.set(availableBridges)
    } catch (error) {
      this.canConfigure.set(false)
      console.error(error)
    }
  }

  public async toggleExternalBridge(block: any, enable: boolean, index: string): Promise<void> {
    const plugin = this.plugin
    if (!plugin) {
      return
    }
    if (enable) {
      const bridgeCache = this.bridgeCache().get(Number(index))
      const matterCache = this.matterBridgeCache().get(Number(index))
      const keepHapDisableIdentifyingMaterial = this.isHapDisableIdentifyingMaterialEnabled
        && typeof bridgeCache?.hap === 'object'
        && bridgeCache.hap !== null
        && bridgeCache.hap.disableIdentifyingMaterial === true

      // Always create HAP bridge configuration when HAP toggle is enabled
      block._bridge = {
        username: bridgeCache ? bridgeCache.username : this.generateUsername(),
        port: await this.getUnusedPort(),
        name: bridgeCache?.name || this.sanitizeBridgeName(plugin.displayName || plugin.name),
        model: bridgeCache?.model,
        manufacturer: bridgeCache?.manufacturer,
        firmwareRevision: bridgeCache?.firmwareRevision,
        debugModeEnabled: bridgeCache?.debugModeEnabled,
        env: bridgeCache?.env || {},
        ...(keepHapDisableIdentifyingMaterial ? { hap: { disableIdentifyingMaterial: true } } : {}),
      }

      // Restore Matter configuration if it was previously cached (cached means it was enabled before disabling)
      // BUT only if the user didn't explicitly disable Matter before disabling the child bridge
      if (matterCache && !this.matterExplicitlyDisabledBeforeChildBridge.has(Number(index))) {
        // Only restore port + disableIpv4 - name is shared at _bridge level
        // Use cached port if available, otherwise get a new Matter port
        block._bridge.matter = {
          port: matterCache.port ?? await this.getUnusedMatterPort(),
          ...(matterCache.disableIpv4 === true ? { disableIpv4: true } : {}),
        }
        if (this.isMatterDisableIpv4Enabled) {
          this.matterDisableIpv4Blocks.update(current => ({ ...current, [Number(index)]: matterCache.disableIpv4 === true }))
        }

        // Also restore the enabled state
        this.matterEnabledBlocks.update(current => ({ ...current, [Number(index)]: true }))

        // Restore Matter commissioning info
        if (block._bridge.username) {
          // Check if this bridge was originally enabled (has existing commissioning info on backend)
          const wasOriginallyEnabled = this.originalMatterBridges().some(m =>
            m.port === matterCache.port,
          )

          if (wasOriginallyEnabled) {
            // Fetch full commissioning info from backend since it still exists
            await this.getMatterCommissioningInfo(block._bridge.username)
          } else {
            // New Matter bridge - set partial commissioning info with allocated port
            // No setupUri triggers "restart homebridge" message in template
            this.matterDeviceInfo.update(current => new Map(current).set(block._bridge.username, { port: matterCache.port } as any))
          }
        }

        // Remove from Matter deletion list since we're restoring it
        if (block._bridge.username) {
          const identifier = block._bridge.username.replace(RE_NON_ALNUM, '-').replace(RE_CONSECUTIVE_DASHES, '-').replace(RE_LEADING_TRAILING_DASH, '')
          this.deleteMatterBridges.update(current => current.filter(b => b.identifier !== identifier))
        }
      }

      if (this.deleteBridges().some(b => b.id === block._bridge.username)) {
        this.deleteBridges.update(current => current.filter(b => b.id !== block._bridge.username))
      }

      // Clean up the tracking flag
      this.matterExplicitlyDisabledBeforeChildBridge.delete(Number(index))

      this.bridgeCache.update(current => new Map(current).set(Number(index), block._bridge))
      await this.getDeviceInfo(block._bridge.username)

      // Set enabled state to true
      this.enabledBlocks.update(current => ({ ...current, [Number(index)]: true }))

      // HAP defaults to on whenever a child bridge is enabled
      this.hapEnabledBlocks.update(current => ({ ...current, [Number(index)]: true }))
      if (this.isHapDisableIdentifyingMaterialEnabled) {
        this.hapDisableIdentifyingMaterialBlocks.update(current => ({
          ...current,
          [Number(index)]: keepHapDisableIdentifyingMaterial,
        }))
      }
    } else {
      // Set enabled state to false
      this.enabledBlocks.update(current => ({ ...current, [Number(index)]: false }))
      this.hapEnabledBlocks.update(current => ({ ...current, [Number(index)]: false }))

      // Cache Matter configuration before deleting if Matter is enabled
      if (block._bridge?.matter && this.matterEnabledBlocks()[Number(index)]) {
        // Only cache port + disableIpv4 - name is shared at _bridge level
        this.matterBridgeCache.update(current => new Map(current).set(Number(index), {
          port: block._bridge.matter.port,
          disableIpv4: block._bridge.matter.disableIpv4 === true,
        }))
      }

      // Check for linked bridges
      if (this.accessoryBridgeLinks().some(link => link.index === index)) {
        this.accessoryBridgeLinks.update(current => current.filter(link => link.index !== index))
        this.currentlySelectedLink.set(null)
      } else {
        // Store unused child bridge id for deletion, so no bridges are orphaned
        const originalBridge = this.originalBridges().find(b => b.username === block._bridge.username)
        if (originalBridge) {
          // Avoid duplicates
          if (!this.deleteBridges().some(b => b.id === block._bridge.username)) {
            const info = this.deviceInfo().get(block._bridge.username)
            this.deleteBridges.update(current => [...current, {
              id: block._bridge.username,
              bridgeName: block._bridge.name || originalBridge.displayName,
              paired: info ? info._isPaired : false,
            }])
          }
        }

        // Check if Matter was already disabled by the user before we disabled the child bridge
        if (block._bridge?.username) {
          const identifier = block._bridge.username.replace(RE_NON_ALNUM, '-').replace(RE_CONSECUTIVE_DASHES, '-').replace(RE_LEADING_TRAILING_DASH, '')
          const matterAlreadyDisabled = this.deleteMatterBridges().some(b => b.identifier === identifier)

          if (matterAlreadyDisabled) {
            // User explicitly disabled Matter before disabling child bridge
            // Track this so we don't restore Matter when re-enabling child bridge
            this.matterExplicitlyDisabledBeforeChildBridge.add(Number(index))
          }
        }

        // Also mark Matter for deletion if it was originally enabled AND not already in deletion list
        if (block._bridge?.matter && block._bridge.username) {
          const wasOriginallyEnabled = this.originalMatterBridges().some(m =>
            m.port === block._bridge.matter.port,
          )

          if (wasOriginallyEnabled) {
            const identifier = block._bridge.username.replace(RE_NON_ALNUM, '-').replace(RE_CONSECUTIVE_DASHES, '-').replace(RE_LEADING_TRAILING_DASH, '')
            // Avoid duplicates
            if (!this.deleteMatterBridges().some(b => b.identifier === identifier)) {
              // Store name before deleting block._bridge
              const name = block._bridge.name || plugin.displayName || plugin.name
              this.deleteMatterBridges.update(current => [...current, {
                username: block._bridge.username,
                identifier,
                name,
              }])
            }
          }
        }
      }

      // Also disable the Matter toggle state when disabling the child bridge
      this.matterEnabledBlocks.update(current => ({ ...current, [Number(index)]: false }))

      delete block._bridge
    }

    // Figure out if we are deleting at least one paired bridge
    this.deletingPairedBridge.set(this.deleteBridges().some(b => b.paired))
  }

  /**
   * Check if any validation errors exist across all enabled bridges
   */
  public get hasValidationErrors(): boolean {
    const configBlocks = this.configBlocks()
    const enabledBlocks = this.enabledBlocks()

    for (const [index, block] of configBlocks.entries()) {
      if (enabledBlocks[index] && block._bridge?.username) {
        if (this.getHapNameValidationError(index.toString()) || this.getHapPortValidationError(index.toString())) {
          return true
        }
      }
    }
    return false
  }

  private async getUnusedPort() {
    try {
      const lookup = await this.$api.get('/server/port/new')
      return lookup.port
    } catch (e) {
      return Math.floor(Math.random() * (60000 - 30000 + 1) + 30000)
    }
  }

  private async getUnusedMatterPort() {
    try {
      const lookup = await this.$api.get('/server/port/new/matter')
      return lookup.port
    } catch (e) {
      // Fallback to Matter port range if API call fails
      return Math.floor(Math.random() * (5541 - 5530 + 1) + 5530)
    }
  }

  private async getDeviceInfo(username: string) {
    try {
      const data = await this.$api.get(`/server/pairings/${username.replace(RE_COLON, '')}`)
      this.deviceInfo.update(current => new Map(current).set(username, data))
    } catch (error) {
      console.error(error)
      this.deviceInfo.update(current => new Map(current).set(username, false))
    }
  }

  /**
   * Sanitize a bridge name to comply with HAP name validation rules
   * Removes invalid characters and ensures name starts/ends with letter or number
   */
  private sanitizeBridgeName(name: string): string {
    if (!name) {
      return name
    }

    // Remove any characters that aren't letters, numbers, spaces, or apostrophes
    let sanitized = name.replace(RE_INVALID_HAP_NAME_CHARS, '')

    // Remove leading/trailing spaces and apostrophes
    sanitized = sanitized.replace(RE_LEADING_TRAILING_SPACE_APOSTROPHE, '')

    // Ensure it starts and ends with letter or number by removing invalid start/end chars
    sanitized = sanitized.replace(RE_LEADING_TRAILING_NON_ALNUM_UNICODE, '')

    return sanitized
  }

  private async getMatterCommissioningInfo(username: string) {
    try {
      // Get all child bridges from the status endpoint
      const childBridges = await this.$childBridges.getAll()

      // Find the bridge matching this username
      const bridge = childBridges.find(b => b.username === username)

      if (bridge && bridge.matterSetupUri) {
        // Store the Matter commissioning info
        this.matterDeviceInfo.update(current => new Map(current).set(username, {
          setupUri: bridge.matterSetupUri,
          pin: bridge.matterPin,
          serialNumber: bridge.matterSerialNumber,
          commissioned: bridge.matterCommissioned,
          deviceCount: bridge.matterDeviceCount,
          port: bridge.matterConfig?.port,
        }))
      } else {
        // Bridge found but Matter not yet started, or QR code not available yet
        // Set partial info so template knows to wait for restart
        this.matterDeviceInfo.update(current => new Map(current).set(username, {
          port: bridge?.matterConfig?.port,
        } as any))
      }
    } catch (error) {
      console.error(error)
      // Set empty object so restart placeholder shows (instead of null which breaks template conditions)
      this.matterDeviceInfo.update(current => new Map(current).set(username, {} as any))
    }
  }

  public async toggleMatterBridge(block: any, enable: boolean, index: string, event?: Event): Promise<void> {
    const plugin = this.plugin
    if (!plugin) {
      return
    }

    // Matter is only supported for platform-based plugins
    if (block.accessory) {
      this.syncCheckboxDom(event, false)
      this.matterEnabledBlocks.update(current => ({ ...current, [Number(index)]: false }))
      return
    }

    // Refuse to disable Matter when HAP is also off — at least one protocol is
    // required unless the running Homebridge supports disabling all protocols.
    if (!enable && !this.hapEnabledBlocks()[Number(index)] && !this.allowDisableAllProtocols) {
      this.$toastr.info(
        this.$translate.instant('child_bridge.config.disable_matter_requires_hap'),
        this.$translate.instant('toast.title_notice'),
      )
      this.syncCheckboxDom(event, true)
      this.matterEnabledBlocks.update(current => ({ ...current, [Number(index)]: true }))
      return
    }

    if (enable) {
      // Set enabled state to true
      this.matterEnabledBlocks.update(current => ({ ...current, [Number(index)]: true }))
      // Re-enabling Matter must clear any lingering externalsOnly — the
      // runtime validation rejects `enabled: true + externalsOnly: true`.
      if (this.isProtocolExternalsOnlyEnabled) {
        this.matterExternalsOnlyBlocks.update(current => ({ ...current, [Number(index)]: false }))
        if (block._bridge?.matter?.externalsOnly !== undefined) {
          delete block._bridge.matter.externalsOnly
        }
      }

      const matterCache = this.matterBridgeCache().get(Number(index))

      // Create _bridge object if it doesn't exist (Matter-only case)
      if (!block._bridge) {
        block._bridge = {
          env: {},
        }
      }

      // Determine port for first-time enablement or restore from cache
      let port: number | undefined

      if (matterCache?.port) {
        // Restore from cache
        port = matterCache.port
      } else {
        // First time enabling - allocate a new Matter port
        port = await this.getUnusedMatterPort()
      }

      // Preserve disableIpv4 across the rebuild: an in-place-disabled block
      // still carries it, otherwise fall back to the cached value.
      const keepDisableIpv4 = block._bridge.matter?.disableIpv4 === true || matterCache?.disableIpv4 === true

      // Only store port + disableIpv4 in matter config - name is now shared at _bridge level
      block._bridge.matter = {
        port,
        ...(keepDisableIpv4 ? { disableIpv4: true } : {}),
      }
      if (this.isMatterDisableIpv4Enabled) {
        this.matterDisableIpv4Blocks.update(current => ({ ...current, [Number(index)]: keepDisableIpv4 }))
      }

      // Update cache with current values (only port + disableIpv4)
      this.matterBridgeCache.update(current => new Map(current).set(Number(index), { port, disableIpv4: keepDisableIpv4 }))

      // If this was marked for deletion, remove it from the delete list
      if (block._bridge.username) {
        const identifier = block._bridge.username.replace(RE_NON_ALNUM, '-').replace(RE_CONSECUTIVE_DASHES, '-').replace(RE_LEADING_TRAILING_DASH, '')
        this.deleteMatterBridges.update(current => current.filter(b => b.identifier !== identifier))

        // Also clear the "explicitly disabled" tracking flag since user is now enabling Matter
        this.matterExplicitlyDisabledBeforeChildBridge.delete(Number(index))

        // Check if this bridge was originally enabled (has existing commissioning info on backend)
        const wasOriginallyEnabled = this.originalMatterBridges().some(m =>
          m.port === port,
        )

        if (wasOriginallyEnabled) {
          // Fetch full commissioning info from backend since it still exists
          await this.getMatterCommissioningInfo(block._bridge.username)
        } else {
          // New Matter bridge - set partial commissioning info with allocated port
          // No setupUri triggers "restart homebridge" message in template
          this.matterDeviceInfo.update(current => new Map(current).set(block._bridge.username, { port } as any))
        }
      }
    } else {
      // Set enabled state to false
      this.matterEnabledBlocks.update(current => ({ ...current, [Number(index)]: false }))

      if (this.allowMatterDisableInPlace) {
        // In-place disable (Homebridge >= 2.0.3-beta.22): keep the matter block,
        // port and on-disk commissioning; just mark it disabled so re-enabling
        // does not require re-commissioning.
        if (block._bridge?.matter) {
          this.matterBridgeCache.update(current => new Map(current).set(Number(index), {
            port: block._bridge.matter.port,
            disableIpv4: block._bridge.matter.disableIpv4 === true,
          }))
          block._bridge.matter.enabled = false
        }
        // Hide commissioning (QR) info while it is disabled
        if (block._bridge?.username) {
          this.matterDeviceInfo.update(current => new Map(current).set(block._bridge.username, null))
        }
        return
      }

      // Legacy teardown (older Homebridge): remove the block and delete its
      // commissioning storage on save.
      // Track for deletion if this was originally enabled
      const wasOriginallyEnabled = this.originalMatterBridges().some(m =>
        block._bridge?.matter && m.port === block._bridge.matter.port,
      )

      // Cache the current values before deleting (for potential restore) - only port + disableIpv4
      if (block._bridge && block._bridge.matter) {
        this.matterBridgeCache.update(current => new Map(current).set(Number(index), {
          port: block._bridge.matter.port,
          disableIpv4: block._bridge.matter.disableIpv4 === true,
        }))
        delete block._bridge.matter
      }

      // Clear commissioning info when disabling
      if (block._bridge?.username) {
        this.matterDeviceInfo.update(current => new Map(current).set(block._bridge.username, null))

        if (wasOriginallyEnabled) {
          // Sanitize username to create identifier (same logic as backend)
          const identifier = block._bridge.username.replace(RE_NON_ALNUM, '-').replace(RE_CONSECUTIVE_DASHES, '-').replace(RE_LEADING_TRAILING_DASH, '')
          // Get name from block._bridge (still available at this point)
          const name = block._bridge.name || plugin.displayName || plugin.name
          this.deleteMatterBridges.update(current => [...current, {
            username: block._bridge.username,
            identifier,
            name,
          }])
        }
      }

      // Clean up if _bridge is now empty
      if (block._bridge && Object.keys(block._bridge).length === 0) {
        delete block._bridge
      }
    }
  }

  public async toggleHapBridge(block: any, enable: boolean, index: string, event?: Event): Promise<void> {
    const idx = Number(index)

    // Accessory-style child bridges cannot disable HAP (no Matter alternative).
    if (!enable && block.accessory) {
      this.$toastr.error(
        this.$translate.instant('child_bridge.config.hap_disabled_for_accessory'),
        this.$translate.instant('toast.title_error'),
      )
      this.syncCheckboxDom(event, true)
      this.hapEnabledBlocks.update(current => ({ ...current, [idx]: true }))
      return
    }

    // Mutual exclusion: refuse to disable HAP unless Matter is enabled for this
    // block — unless the running Homebridge supports disabling all protocols.
    if (!enable && !this.matterEnabledBlocks()[idx] && !this.allowDisableAllProtocols) {
      this.$toastr.info(
        this.$translate.instant('child_bridge.config.disable_hap_requires_matter'),
        this.$translate.instant('toast.title_notice'),
      )
      this.syncCheckboxDom(event, true)
      this.hapEnabledBlocks.update(current => ({ ...current, [idx]: true }))
      return
    }

    if (enable) {
      const keepDisableIdentifyingMaterial = this.isHapDisableIdentifyingMaterialEnabled
        && this.hapDisableIdentifyingMaterialBlocks()[idx] === true
      this.hapEnabledBlocks.update(current => ({ ...current, [idx]: true }))
      // Re-enabling HAP must also clear any lingering externalsOnly setting —
      // the validation rule on the new runtime is `externalsOnly requires
      // enabled: false`, so this combination would be rejected.
      if (this.isProtocolExternalsOnlyEnabled) {
        this.hapExternalsOnlyBlocks.update(current => ({ ...current, [idx]: false }))
      }

      if (!block._bridge) {
        block._bridge = { env: {} }
      }

      // Restore HAP defaults if missing (Matter-only bridge gaining HAP).
      if (!block._bridge.username) {
        block._bridge.username = this.generateUsername()
      }
      if (!block._bridge.port) {
        block._bridge.port = await this.getUnusedPort()
      }
      if (!block._bridge.name && this.plugin) {
        block._bridge.name = this.sanitizeBridgeName(this.plugin.displayName || this.plugin.name)
      }

      if (keepDisableIdentifyingMaterial) {
        block._bridge.hap = { disableIdentifyingMaterial: true }
      } else {
        delete block._bridge.hap
      }

      this.bridgeCache.update(current => new Map(current).set(idx, block._bridge))
      await this.getDeviceInfo(block._bridge.username)
    } else {
      this.hapEnabledBlocks.update(current => ({ ...current, [idx]: false }))
      block._bridge = block._bridge || {}
      this.writeHapDisabled(block, idx)
    }
  }

  /**
   * Write the "HAP disabled" shape onto a bridge block.
   *
   * Older Homebridge expects `_bridge.hap: false`; >= 2.0.3-beta.26 expects
   * `_bridge.hap: { enabled: false }`. The feature flag decides which shape
   * gets written. externalsOnly is never set here — disabling HAP transitions
   * the block to the plain disabled shape, and the externalsOnly toggle (which
   * only appears once HAP is disabled) writes the externalsOnly shape itself
   * via toggleHapExternalsOnly(). The independent disableIdentifyingMaterial
   * preference is preserved in either nested disabled shape.
   */
  private writeHapDisabled(block: any, idx: number): void {
    if (this.isProtocolExternalsOnlyEnabled || this.isHapDisableIdentifyingMaterialEnabled) {
      block._bridge.hap = {
        enabled: false,
        ...(this.hapDisableIdentifyingMaterialBlocks()[idx] === true
          ? { disableIdentifyingMaterial: true }
          : {}),
      }
    } else {
      block._bridge.hap = false
    }
  }

  /**
   * Toggle the `hap.externalsOnly` flag for a block. Only meaningful when HAP
   * is already disabled (the toggle is hidden in the UI when HAP is enabled).
   */
  public toggleHapExternalsOnly(event: Event, idx: number): void {
    if (!this.isProtocolExternalsOnlyEnabled) {
      return
    }
    const checked = (event.target as HTMLInputElement).checked
    this.hapExternalsOnlyBlocks.update(current => ({ ...current, [idx]: checked }))

    const block = this.configBlocks()[idx]
    if (!block?._bridge) {
      return
    }
    // externalsOnly is only valid when HAP is disabled; write the nested
    // object form with the current toggle state.
    if (this.hapEnabledBlocks()[idx] === false) {
      block._bridge.hap = {
        enabled: false,
        ...(checked ? { externalsOnly: true } : {}),
        ...(this.hapDisableIdentifyingMaterialBlocks()[idx] === true
          ? { disableIdentifyingMaterial: true }
          : {}),
      }
    }
  }

  /**
   * Toggle the `hap.disableIdentifyingMaterial` flag for a block. The option
   * is independent of HAP enablement and is preserved across HAP and child
   * bridge disable/enable round-trips.
   */
  public toggleHapDisableIdentifyingMaterial(event: Event, idx: number): void {
    if (!this.isHapDisableIdentifyingMaterialEnabled) {
      return
    }
    const checked = (event.target as HTMLInputElement).checked
    const block = this.configBlocks()[idx]

    this.hapDisableIdentifyingMaterialBlocks.update(current => ({ ...current, [idx]: checked }))

    if (!block?._bridge) {
      return
    }

    const existingHap = block._bridge.hap
    const hap = typeof existingHap === 'object' && existingHap !== null
      ? { ...existingHap }
      : existingHap === false || this.hapEnabledBlocks()[idx] === false
        ? { enabled: false }
        : {}

    if (checked) {
      hap.disableIdentifyingMaterial = true
    } else {
      delete hap.disableIdentifyingMaterial
    }

    if (Object.keys(hap).length > 0) {
      block._bridge.hap = hap
    } else {
      delete block._bridge.hap
    }
  }

  /**
   * Toggle the `matter.externalsOnly` flag for a block. Only meaningful when
   * Matter is disabled (the toggle is hidden in the UI when Matter is on).
   *
   * When toggled on against a child bridge that has never configured matter,
   * a matter block is auto-created (`{ port, enabled: false, externalsOnly: true }`)
   * so the user doesn't have to enable-then-disable matter just to reach this
   * setting. When toggled off again, that auto-created block is removed iff
   * matter wasn't otherwise engaged in this session (tracked via
   * `matterBridgeCache`, which is populated on every load and every
   * `toggleMatterBridge` call).
   */
  public async toggleMatterExternalsOnly(event: Event, idx: number): Promise<void> {
    if (!this.isProtocolExternalsOnlyEnabled) {
      return
    }
    const checked = (event.target as HTMLInputElement).checked
    const block = this.configBlocks()[idx]

    // Accessory blocks have no matter — sync DOM back and bail.
    if (block?.accessory) {
      this.syncCheckboxDom(event, false)
      this.matterExternalsOnlyBlocks.update(current => ({ ...current, [idx]: false }))
      return
    }

    this.matterExternalsOnlyBlocks.update(current => ({ ...current, [idx]: checked }))

    if (!block?._bridge) {
      return
    }

    if (checked) {
      if (!block._bridge.matter) {
        const port = await this.getUnusedMatterPort()
        block._bridge.matter = { port, enabled: false, externalsOnly: true }
      } else {
        block._bridge.matter.externalsOnly = true
      }
    } else {
      if (!block._bridge.matter) {
        return
      }
      delete block._bridge.matter.externalsOnly
      // If the matter block exists only because the user toggled externalsOnly
      // on (matter was never originally configured and was never engaged via
      // the matter toggle in this session), tearing externalsOnly off tears
      // the block out too — otherwise we'd leave behind an orphan
      // `{ port, enabled: false }` matter block the user never asked for.
      if (!this.matterBridgeCache().has(idx)) {
        delete block._bridge.matter
      }
    }
  }

  /**
   * Toggle the Matter disableIpv4 flag for a block. When on, the Matter mDNS
   * responder for this bridge runs IPv6-only. Only available on Homebridge
   * >= 2.2.0 (see the `matterDisableIpv4` feature flag) and only shown while
   * Matter is enabled for the block.
   */
  public toggleMatterDisableIpv4(event: Event, idx: number): void {
    if (!this.isMatterDisableIpv4Enabled) {
      return
    }
    const checked = (event.target as HTMLInputElement).checked
    const block = this.configBlocks()[idx]

    this.matterDisableIpv4Blocks.update(current => ({ ...current, [idx]: checked }))

    if (!block?._bridge?.matter) {
      return
    }

    if (checked) {
      block._bridge.matter.disableIpv4 = true
    } else {
      delete block._bridge.matter.disableIpv4
    }

    // Keep the cache in sync so disable/enable round-trips preserve the flag
    this.matterBridgeCache.update((current) => {
      const existing = current.get(idx)
      return existing ? new Map(current).set(idx, { ...existing, disableIpv4: checked }) : current
    })
  }

  public getMatterPortValidationError(index: string): boolean {
    const block = this.configBlocks()[Number(index)]
    const port = block._bridge?.matter?.port

    if (!port && port !== 0) {
      return false // Empty is valid (optional)
    }

    if (typeof port !== 'number' || !Number.isInteger(port) || port < 1024 || port > 65535) {
      return true
    }

    // Check for reserved ports
    if ([5353, 8080, 8443].includes(port)) {
      return true
    }

    // Check if Matter port conflicts with HAP port on same bridge
    const hapPort = block._bridge?.port
    return hapPort && port === hapPort
  }

  public getHapNameValidationError(index: string): boolean {
    const block = this.configBlocks()[Number(index)]
    if (!block._bridge?.name) {
      return false // empty is valid
    }

    const name = block._bridge.name

    // HAP name validation: must start and end with letter/number, can contain letters, numbers, spaces, and apostrophes
    // https://github.com/homebridge/HAP-NodeJS/blob/ee41309fd9eac383cdcace39f4f6f6a3d54396f3/src/lib/util/checkName.ts#L12
    return !RE_HAP_NAME_PATTERN.test(name)
  }

  public getHapPortValidationError(index: string): boolean {
    const configBlocks = this.configBlocks()
    const enabledBlocks = this.enabledBlocks()
    const block = configBlocks[Number(index)]
    const port = block._bridge?.port

    if (!port && port !== 0) {
      return false // Empty is valid (optional - will be auto-allocated)
    }

    if (typeof port !== 'number' || !Number.isInteger(port) || port < 1025 || port > 65533) {
      return true
    }

    // Check for port conflicts with other enabled bridges
    for (const [i, otherBlock] of configBlocks.entries()) {
      if (i.toString() !== index && enabledBlocks[i] && otherBlock._bridge?.port === port) {
        return true
      }
    }

    // Check if HAP port conflicts with Matter port on same bridge
    const matterPort = block._bridge?.matter?.port
    return !!matterPort && port === matterPort
  }

  /**
   * The display name of the first bridge whose name or port fails validation.
   * The disabled Save button needs to say why - the offending bridge may not
   * even be the one currently on screen (#2892).
   */
  public get validationErrorBridgeName(): string | null {
    const configBlocks = this.configBlocks()
    const enabledBlocks = this.enabledBlocks()

    for (const [index, block] of configBlocks.entries()) {
      if (enabledBlocks[index] && block._bridge?.username) {
        if (this.getHapNameValidationError(index.toString()) || this.getHapPortValidationError(index.toString())) {
          return block._bridge.name || block.name || block.platform || block.accessory || `#${index + 1}`
        }
      }
    }
    return null
  }

  private normalizeMatterConfig(block: any): void {
    if (block._bridge?.matter) {
      // Normalize port: convert empty/null to undefined
      if (!block._bridge.matter.port && block._bridge.matter.port !== 0) {
        block._bridge.matter.port = undefined
      }

      // If port is undefined, remove the matter config
      if (block._bridge.matter.port === undefined) {
        delete block._bridge.matter
      }
    }
  }

  private normalizeHapConfig(
    block: any,
    hapEnabled: boolean | undefined,
    hapExternalsOnly = false,
    hapDisableIdentifyingMaterial = false,
  ): void {
    if (!block._bridge) {
      return
    }
    if (hapEnabled === false) {
      if (this.isProtocolExternalsOnlyEnabled || this.isHapDisableIdentifyingMaterialEnabled) {
        // Nested form for newer Homebridge versions. Optional settings are
        // written only when explicitly toggled on.
        block._bridge.hap = {
          enabled: false,
          ...(hapExternalsOnly ? { externalsOnly: true } : {}),
          ...(hapDisableIdentifyingMaterial ? { disableIdentifyingMaterial: true } : {}),
        }
      } else {
        block._bridge.hap = false
      }
    } else if (hapDisableIdentifyingMaterial) {
      block._bridge.hap = { disableIdentifyingMaterial: true }
    } else {
      delete block._bridge.hap
    }
  }

  // The checkbox uses one-way `[checked]` binding from a signal. When the user
  // clicks, the browser flips the native `checked` flag before the (change)
  // handler runs; if the handler then writes the same value back to the
  // signal, Angular sees no diff and never re-syncs the DOM. Force the DOM
  // back into the desired state on rejection paths so the toggle matches the
  // signal.
  private syncCheckboxDom(event: Event | undefined, checked: boolean): void {
    const target = event?.target as HTMLInputElement | null | undefined
    if (target) {
      target.checked = checked
    }
  }

  public async save(): Promise<void> {
    const plugin = this.plugin
    if (!plugin) {
      return
    }

    this.saveInProgress.set(true)

    try {
      const configBlocks = this.configBlocks()
      const matterEnabledBlocks = this.matterEnabledBlocks()
      const hapEnabledBlocks = this.hapEnabledBlocks()
      const enabledBlocks = this.enabledBlocks()

      // Validate HAP and Matter configs before saving
      for (const [index, block] of configBlocks.entries()) {
        // At least one protocol must be on for any enabled child bridge — unless
        // the running Homebridge supports disabling all protocols. Accessory
        // blocks always use HAP (no Matter alternative), so treat HAP as on for
        // them even if the signal was never set explicitly — e.g. when an
        // accessory block is linked to a shared child bridge.
        const hapOn = block.accessory ? true : !!hapEnabledBlocks[index]
        if (!this.allowDisableAllProtocols && enabledBlocks[index] && !hapOn && !matterEnabledBlocks[index]) {
          this.$toastr.error(
            this.$translate.instant('child_bridge.config.at_least_one_protocol'),
            this.$translate.instant('toast.title_error'),
          )
          this.saveInProgress.set(false)
          return
        }

        // HAP validation (only when HAP is enabled for this block)
        if (block._bridge?.username && hapEnabledBlocks[index] !== false) {
          if (this.getHapNameValidationError(index.toString())) {
            this.$toastr.error(
              this.$translate.instant('plugins.bridge.name_error'),
              this.$translate.instant('toast.title_error'),
            )
            this.saveInProgress.set(false)
            return
          }

          if (this.getHapPortValidationError(index.toString())) {
            this.$toastr.error(
              this.$translate.instant('plugins.bridge.port_error', {
                type: 'HAP',
              }),
              this.$translate.instant('toast.title_error'),
            )
            this.saveInProgress.set(false)
            return
          }
        }

        // Matter validation (for both Matter-only and HAP+Matter)
        if (matterEnabledBlocks[index]) {
          if (this.getMatterPortValidationError(index.toString())) {
            this.$toastr.error(
              this.$translate.instant('plugins.bridge.port_error', {
                type: 'Matter',
              }),
              this.$translate.instant('toast.title_error'),
            )
            this.saveInProgress.set(false)
            return
          }
        }

        // Normalize the matter config (trim strings, remove empty values)
        this.normalizeMatterConfig(block)

        // Normalize HAP into the shape supported by the running Homebridge.
        // externalsOnly carries through only when HAP is disabled; the
        // identifying-material preference is independent of enablement.
        const hapExternalsOnly = this.isProtocolExternalsOnlyEnabled
          && hapEnabledBlocks[index] === false
          && this.hapExternalsOnlyBlocks()[index] === true
        const hapDisableIdentifyingMaterial = this.isHapDisableIdentifyingMaterialEnabled
          && this.hapDisableIdentifyingMaterialBlocks()[index] === true
        this.normalizeHapConfig(block, hapEnabledBlocks[index], hapExternalsOnly, hapDisableIdentifyingMaterial)
      }

      await this.$api.post(`/config-editor/plugin/${encodeURIComponent(plugin.name)}`, configBlocks)

      // Delete unused bridges, so no bridges are orphaned
      for (const bridge of this.deleteBridges()) {
        try {
          await this.$api.delete(`/server/pairings/${bridge.id.replace(RE_COLON, '')}`)
        } catch (error) {
          console.error(error)
          this.$toastr.error(this.$translate.instant('settings.reset_bridge.error'), this.$translate.instant('toast.title_error'))
        }
      }

      // Delete unused Matter bridges (storage cleanup)
      // Skip bridges that were already deleted via the HAP pairing endpoint above (it deletes Matter info too)
      const matterBridgesToDelete = this.deleteMatterBridges().filter(
        mb => !this.deleteBridges().some(b => b.id === mb.username),
      )
      for (const matterBridge of matterBridgesToDelete) {
        try {
          const deviceId = matterBridge.username.replace(RE_COLON, '')
          await this.$api.delete(`/server/pairings/${deviceId}/matter`)
        } catch (error) {
          console.error(error)
          this.$toastr.error(this.$translate.instant('settings.reset_bridge.error'), this.$translate.instant('toast.title_error'))
        }
      }

      // Check what has changed
      const cronHasChanged = this.hasScheduledRestartCronChanged()
      const hideAlertsChanged = this.hasHideAlertsChanged()
      const hideChildBridgeSetupChanged = this.hasHideChildBridgeSetupChanged()
      const bridgeConfigChanged = this.hasBridgeConfigChanged()
      const bridgesDeleted = this.deleteBridges().length > 0 || this.deleteMatterBridges().length > 0
      const nothingChanged = !cronHasChanged && !hideAlertsChanged && !hideChildBridgeSetupChanged && !bridgeConfigChanged && !bridgesDeleted
      const onlyHideAlertsChanged = (hideAlertsChanged || hideChildBridgeSetupChanged) && !cronHasChanged && !bridgeConfigChanged && !bridgesDeleted

      // Save the per-plugin "hide set-up recommendation" toggle if it changed
      if (hideChildBridgeSetupChanged) {
        try {
          await this.saveHideChildBridgeSetup()
        } catch (error) {
          console.error(error)
        }
      }

      // Save hide alert settings only for bridges that changed and are not being deleted
      for (const [username, bridgeConfig] of this.bridgeConfigs.entries()) {
        // Skip bridges that are being deleted
        if (this.deleteBridges().some(b => b.id === username)) {
          continue
        }

        const original = this.originalHideAlerts.get(username)

        const currentHapAlert = !!bridgeConfig.hideHapAlert
        const currentMatterAlert = !!bridgeConfig.hideMatterAlert

        // If no original, treat as false (default for new bridges)
        const originalHapAlert = original ? !!original.hideHapAlert : false
        const originalMatterAlert = original ? !!original.hideMatterAlert : false

        try {
          // Save hideHapAlert only if changed
          if (currentHapAlert !== originalHapAlert) {
            await this.saveHideAlert(username, 'hap', currentHapAlert)
          }

          // Save hideMatterAlert only if changed
          if (currentMatterAlert !== originalMatterAlert) {
            await this.saveHideAlert(username, 'matter', currentMatterAlert)
          }
        } catch (error) {
          console.error(error)
        }
      }

      // Save scheduled restart cron only for bridges that changed and are not being deleted
      for (const [username, bridgeConfig] of this.bridgeConfigs.entries()) {
        // Skip bridges that are being deleted
        if (this.deleteBridges().some(b => b.id === username)) {
          continue
        }

        const currentValue = bridgeConfig.scheduledRestartCron || null
        const originalValue = this.originalScheduledRestartCrons.get(username) || null

        // Normalize empty strings to null for comparison
        const normalizedCurrent = currentValue === '' ? null : currentValue
        const normalizedOriginal = originalValue === '' ? null : originalValue

        if (normalizedCurrent !== normalizedOriginal) {
          try {
            await this.saveScheduledRestartCron(username, normalizedCurrent)
          } catch (error) {
            console.error(error)
          }
        }
      }

      // Set full service restart flag if cron changed
      if (cronHasChanged) {
        try {
          await this.$api.put('/platform-tools/hb-service/set-full-service-restart-flag', {})
        } catch (error) {
          console.error(error)
        }
      }

      // Close modal without restart if nothing changed
      if (nothingChanged) {
        this.$activeModal.close()
      } else if (onlyHideAlertsChanged) {
        // Close modal with 'refresh' result if only hide alerts changed
        this.$activeModal.close('refresh')
      } else {
        // Show restart modal for any other changes
        this.$activeModal.close()
        this.$modal.open(RestartHomebridgeComponent, {
          size: 'lg',
          backdrop: 'static',
          keyboard: false,
        })
      }
    } catch (error) {
      console.error(error)
      const message = error instanceof Error ? error.message : 'Failed to save configuration'
      this.$toastr.error(message, this.$translate.instant('toast.title_error'))
    } finally {
      this.saveInProgress.set(false)
    }
  }

  public openPluginConfig(): void {
    const plugin = this.plugin
    if (!plugin) {
      return
    }

    // Close the existing modal
    this.$activeModal.close()

    // Open the plugin config modal
    void this.$plugin.settings({
      name: plugin.name,
      settingsSchema: true,
      links: {},
    } as Plugin)
  }

  private generateUsername() {
    const hexDigits = '0123456789ABCDEF'
    let username = '0E:'
    for (let i = 0; i < 5; i += 1) {
      username += hexDigits.charAt(Math.round(Math.random() * 15))
      username += hexDigits.charAt(Math.round(Math.random() * 15))
      if (i !== 4) {
        username += ':'
      }
    }
    return username
  }

  public openFullConfigEditor() {
    void this.$router.navigate(['/config'])
    this.$activeModal.close()
  }

  public dismissModal() {
    this.$activeModal.dismiss('Dismiss')
  }

  public closeModal() {
    this.$activeModal.close('Dismiss')
  }

  /**
   * Load bridge configurations from settings
   */
  private async loadBridgeConfigs(): Promise<void> {
    // Load from settings env which is already populated from the server
    const bridges = this.$settings.env.bridges || []
    this.bridgeConfigs.clear()
    this.originalScheduledRestartCrons.clear()
    this.originalHideAlerts.clear()
    for (const bridge of bridges) {
      const normalizedUsername = bridge.username.toUpperCase()
      this.bridgeConfigs.set(normalizedUsername, bridge)
      // Store original values for change detection
      this.originalScheduledRestartCrons.set(normalizedUsername, bridge.scheduledRestartCron || null)
      this.originalHideAlerts.set(normalizedUsername, {
        hideHapAlert: bridge.hideHapAlert,
        hideMatterAlert: bridge.hideMatterAlert,
      })
    }
  }

  private async loadGlobalStartupSettings(): Promise<void> {
    try {
      const data = await this.$api.get('/platform-tools/hb-service/homebridge-startup-settings')
      this.globalDebug.set(data.ENV_DEBUG || '')
      this.globalNodeOptions.set(data.ENV_NODE_OPTIONS || '')
    } catch {
      // Non-critical - prefix just won't show
    }
  }

  /**
   * Check if a specific bridge protocol alert is hidden
   */
  public isUnpairingHidden(username: string, protocol: 'hap' | 'matter'): boolean {
    const bridge = this.bridgeConfigs.get(username.toUpperCase())
    if (!bridge) {
      return false
    }
    return protocol === 'hap' ? !!bridge.hideHapAlert : !!bridge.hideMatterAlert
  }

  /**
   * Toggle hiding of the "set up child bridge" recommendation for this plugin
   * (will be saved when modal is saved).
   */
  public toggleHideChildBridgeSetup(): void {
    this.hideChildBridgeSetup.update(v => !v)
  }

  /**
   * Toggle hiding of unpairing alert for a specific bridge protocol (will be saved when modal is saved)
   */
  public toggleHideUnpairing(username: string, protocol: 'hap' | 'matter'): void {
    const normalizedUsername = username.toUpperCase()
    const currentValue = this.isUnpairingHidden(username, protocol)
    const newValue = !currentValue

    // Update local cache
    let bridge = this.bridgeConfigs.get(normalizedUsername)
    if (!bridge) {
      bridge = { username: normalizedUsername }
      this.bridgeConfigs.set(normalizedUsername, bridge)
    }

    if (protocol === 'hap') {
      if (newValue) {
        bridge.hideHapAlert = true
      } else {
        delete bridge.hideHapAlert
      }
    } else {
      if (newValue) {
        bridge.hideMatterAlert = true
      } else {
        delete bridge.hideMatterAlert
      }
    }
  }

  /**
   * Get the scheduled restart cron for a specific bridge
   */
  public getScheduledRestartCron(username: string | undefined): string {
    if (!username) {
      return ''
    }
    const bridge = this.bridgeConfigs.get(username.toUpperCase())
    return bridge?.scheduledRestartCron || ''
  }

  /**
   * Update scheduled restart cron locally (will be saved when modal is saved)
   */
  public asInputElement(target: EventTarget | null): HTMLInputElement {
    return target as HTMLInputElement
  }

  public onScheduledRestartCronChange(value: string, username: string): void {
    if (!username) {
      return
    }

    const normalizedUsername = username.toUpperCase()
    let bridge = this.bridgeConfigs.get(normalizedUsername)
    if (!bridge) {
      bridge = { username: normalizedUsername }
      this.bridgeConfigs.set(normalizedUsername, bridge)
    }

    // Update local cache
    const trimmedValue = value?.trim()
    if (trimmedValue) {
      bridge.scheduledRestartCron = trimmedValue
    } else {
      delete bridge.scheduledRestartCron
    }
  }

  /**
   * Check if scheduled restart cron has changed for any bridge
   */
  private hasScheduledRestartCronChanged(): boolean {
    for (const [username, bridge] of this.bridgeConfigs.entries()) {
      const currentValue = bridge.scheduledRestartCron || null
      const originalValue = this.originalScheduledRestartCrons.get(username) || null

      // Normalize empty strings to null for comparison
      const normalizedCurrent = currentValue === '' ? null : currentValue
      const normalizedOriginal = originalValue === '' ? null : originalValue

      if (normalizedCurrent !== normalizedOriginal) {
        return true
      }
    }
    return false
  }

  /**
   * Check if bridge configuration (not including hide alerts or cron) has changed
   */
  private hasBridgeConfigChanged(): boolean {
    const configBlocks = this.configBlocks()

    // Compare against the count of UNIQUE bridge usernames currently in the
    // config blocks. `originalBridges` only stores one entry per unique bridge
    // (linked accessory blocks share a single bridge), so comparing the raw
    // `configBlocks.length` to it falsely reports "changed" both for plugins
    // without any child bridge AND for plugins with linked accessory blocks.
    const currentBridgeUsernames = new Set(
      configBlocks
        .filter(b => b._bridge && b._bridge.username)
        .map(b => b._bridge.username),
    )
    if (currentBridgeUsernames.size !== this.originalBridges().length) {
      return true
    }

    // Check if any bridge config has changed
    for (const [, block] of configBlocks.entries()) {
      if (!block._bridge) {
        continue
      }

      const original = this.originalBridges().find(b => b.username === block._bridge.username)
      if (!original) {
        // New bridge added
        return true
      }

      // Check all bridge properties that require restart
      if (block._bridge.name !== original.name) {
        return true
      }
      if (block._bridge.port !== original.port) {
        return true
      }
      if (block._bridge.model !== original.model) {
        return true
      }
      if (block._bridge.manufacturer !== original.manufacturer) {
        return true
      }
      if (block._bridge.firmwareRevision !== original.firmwareRevision) {
        return true
      }
      if (block._bridge.debugModeEnabled !== original.debugModeEnabled) {
        return true
      }

      // Check env variables
      const currentEnv = block._bridge.env || {}
      const originalEnv = original.env || {}
      if (currentEnv.DEBUG !== originalEnv.DEBUG) {
        return true
      }
      if (currentEnv.NODE_OPTIONS !== originalEnv.NODE_OPTIONS) {
        return true
      }

      // Check HAP disabled state. Both shapes are tolerated:
      // legacy boolean (`hap === false`) and nested object (`hap.enabled === false`).
      // Nested HAP options are also part of the persisted state.
      const isHapDisabled = (h: any) => h === false || (typeof h === 'object' && h !== null && h.enabled === false)
      const hapExternalsOnly = (h: any) => typeof h === 'object' && h !== null && h.externalsOnly === true
      const hapDisableIdentifyingMaterial = (h: any) => typeof h === 'object' && h !== null && h.disableIdentifyingMaterial === true
      if (isHapDisabled(block._bridge.hap) !== isHapDisabled(original.hap)) {
        return true
      }
      if (hapExternalsOnly(block._bridge.hap) !== hapExternalsOnly(original.hap)) {
        return true
      }
      if (hapDisableIdentifyingMaterial(block._bridge.hap) !== hapDisableIdentifyingMaterial(original.hap)) {
        return true
      }

      // Check Matter configuration
      const hasMatter = !!block._bridge.matter
      const hadMatter = !!original.matter
      if (hasMatter !== hadMatter) {
        return true
      }
      if (hasMatter && hadMatter) {
        if (block._bridge.matter.port !== original.matter.port) {
          return true
        }
        if (block._bridge.matter.externalsOnly !== original.matter.externalsOnly) {
          return true
        }
      }
    }

    return false
  }

  /**
   * Check if hide alerts have changed for any bridge
   */
  private hasHideAlertsChanged(): boolean {
    for (const [username, bridge] of this.bridgeConfigs.entries()) {
      const original = this.originalHideAlerts.get(username)

      const currentHapAlert = !!bridge.hideHapAlert
      const currentMatterAlert = !!bridge.hideMatterAlert

      // If no original, treat as false (default for new bridges)
      const originalHapAlert = original ? !!original.hideHapAlert : false
      const originalMatterAlert = original ? !!original.hideMatterAlert : false

      if (currentHapAlert !== originalHapAlert || currentMatterAlert !== originalMatterAlert) {
        return true
      }
    }
    return false
  }

  private hasHideChildBridgeSetupChanged(): boolean {
    return this.hideChildBridgeSetup() !== this.originalHideChildBridgeSetup
  }

  private async saveHideChildBridgeSetup(): Promise<void> {
    const plugin = this.plugin
    if (!plugin) {
      return
    }

    const wantHidden = this.hideChildBridgeSetup()
    const currentList = this.$settings.env.plugins?.hideChildBridgeSetupFor || []
    let nextList = [...currentList]

    if (wantHidden && !nextList.includes(plugin.name)) {
      nextList = [...nextList, plugin.name].sort((a, b) => a.localeCompare(b))
    } else if (!wantHidden) {
      nextList = nextList.filter(x => x !== plugin.name)
    }

    await this.$api.put('/config-editor/ui/plugins/hide-child-bridge-setup-for', { body: nextList })
    this.$settings.setEnvItem('plugins.hideChildBridgeSetupFor', nextList)
    this.originalHideChildBridgeSetup = wantHidden
  }

  /**
   * Update or add a bridge configuration in the local settings env
   */
  private updateLocalBridgeConfig(username: string, updates: Partial<BridgeConfig>): void {
    const normalizedUsername = username.toUpperCase()
    const bridges = this.$settings.env.bridges || []
    const bridgeIndex = bridges.findIndex(b => b.username.toUpperCase() === normalizedUsername)

    if (bridgeIndex !== -1) {
      // Update existing bridge
      Object.assign(bridges[bridgeIndex], updates)
    } else {
      // Add new bridge entry
      bridges.push({
        username: normalizedUsername,
        ...updates,
      })
    }

    this.$settings.env.bridges = bridges
  }

  /**
   * Save hide alert setting for a specific bridge protocol
   */
  private async saveHideAlert(username: string, protocol: 'hap' | 'matter', value: boolean): Promise<void> {
    const normalizedUsername = username.toUpperCase()
    const endpoint = protocol === 'hap'
      ? `/config-editor/ui/bridges/${encodeURIComponent(normalizedUsername)}/hide-hap-alert`
      : `/config-editor/ui/bridges/${encodeURIComponent(normalizedUsername)}/hide-matter-alert`

    try {
      await this.$api.put(endpoint, { value })
      this.updateLocalBridgeConfig(
        normalizedUsername,
        protocol === 'hap' ? { hideHapAlert: value } : { hideMatterAlert: value },
      )
    } catch (error) {
      console.error(`Failed to update hide ${protocol} alert:`, error)
      throw error
    }
  }

  /**
   * Save scheduled restart cron for a specific bridge
   */
  private async saveScheduledRestartCron(username: string, value: string | null): Promise<void> {
    const normalizedUsername = username.toUpperCase()

    try {
      await this.$api.put(
        `/config-editor/ui/bridges/${encodeURIComponent(normalizedUsername)}/scheduled-restart-cron`,
        { value: value || null },
      )

      if (value) {
        this.updateLocalBridgeConfig(normalizedUsername, { scheduledRestartCron: value })
      } else {
        // Remove the property if value is null
        const bridges = this.$settings.env.bridges || []
        const bridgeIndex = bridges.findIndex(b => b.username.toUpperCase() === normalizedUsername)
        if (bridgeIndex !== -1) {
          delete bridges[bridgeIndex].scheduledRestartCron
          this.$settings.env.bridges = bridges
        }
      }
    } catch (error) {
      console.error('Failed to update scheduled restart cron:', error)
      throw error
    }
  }
}

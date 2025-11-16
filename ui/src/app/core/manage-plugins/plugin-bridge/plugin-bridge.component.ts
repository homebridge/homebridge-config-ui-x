import type { DeviceInfo, PluginSchema } from '@/app/core/manage-plugins/manage-plugins.interfaces'
import type { BridgeConfig } from '@/app/core/settings.interfaces'

import { NgClass } from '@angular/common'
import { Component, inject, Input, OnInit } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { Router } from '@angular/router'
import { NgbActiveModal, NgbAlert, NgbModal } from '@ng-bootstrap/ng-bootstrap'
import { TranslatePipe, TranslateService } from '@ngx-translate/core'
import { ToastrService } from 'ngx-toastr'
import { firstValueFrom } from 'rxjs'

import { ApiService } from '@/app/core/api.service'
import { QrcodeComponent } from '@/app/core/components/qrcode/qrcode.component'
import { RestartHomebridgeComponent } from '@/app/core/components/restart-homebridge/restart-homebridge.component'
import { Plugin } from '@/app/core/manage-plugins/manage-plugins.interfaces'
import { ManagePluginsService } from '@/app/core/manage-plugins/manage-plugins.service'
import { SettingsService } from '@/app/core/settings.service'

@Component({
  templateUrl: './plugin-bridge.component.html',
  styleUrls: ['./plugin-bridge.component.scss'],
  standalone: true,
  imports: [
    FormsModule,
    NgbAlert,
    QrcodeComponent,
    NgClass,
    TranslatePipe,
  ],
})
export class PluginBridgeComponent implements OnInit {
  private $activeModal = inject(NgbActiveModal)
  private $api = inject(ApiService)
  private $modal = inject(NgbModal)
  private $plugin = inject(ManagePluginsService)
  private $router = inject(Router)
  private $settings = inject(SettingsService)
  private $toastr = inject(ToastrService)
  private $translate = inject(TranslateService)
  private matterExplicitlyDisabledBeforeChildBridge: Set<number> = new Set()
  private bridgeConfigs = new Map<string, BridgeConfig>()
  private originalScheduledRestartCrons = new Map<string, string | null>()
  private originalHideAlerts = new Map<string, { hideHapAlert?: boolean, hideMatterAlert?: boolean }>()

  @Input() plugin: Plugin
  @Input() schema: PluginSchema
  @Input() justInstalled = false

  public loading = true
  public canConfigure = true
  public configBlocks: any[] = []
  public selectedBlock: string = '0'
  public isPlatform: boolean
  public enabledBlocks: Record<number, boolean> = {}
  public bridgeCache: Map<number, Record<string, any>> = new Map()
  public originalBridges: any[] = []
  public deviceInfo: Map<string, DeviceInfo | false> = new Map()
  public matterEnabledBlocks: Record<number, boolean> = {}
  public matterBridgeCache: Map<number, Record<string, any>> = new Map()
  public originalMatterBridges: any[] = []
  public matterDeviceInfo: Map<string, any> = new Map()
  public deleteMatterBridges: { username: string, identifier: string, name: string }[] = []
  public saveInProgress = false
  public canShowBridgeDebug = false
  public deleteBridges: { id: string, bridgeName: string, paired: boolean }[] = []
  public deletingPairedBridge: boolean = false
  public accessoryBridgeLinks: { index: string, usesIndex: string, name: string, username: string, port: number }[] = []
  public bridgesAvailableForLink: { index: string, usesIndex: string, name: string, username: string, port: number }[] = []
  public currentlySelectedLink: { index: string, usesIndex: string, name: string, username: string, port: number } | null = null
  public currentBridgeHasLinks: boolean = false
  public isMatterSupported = this.$settings.isFeatureEnabled('matterSupport')
  public readonly defaultIcon = 'assets/hb-icon.png'
  public readonly linkChildBridges = '<a href="https://github.com/homebridge/homebridge/wiki/Child-Bridges" target="_blank"><i class="fas fa-external-link-alt primary-text"></i></a>'
  public readonly linkDebug = '<a href="https://github.com/homebridge/homebridge-config-ui-x/wiki/Debug-Common-Values" target="_blank"><i class="fa fa-external-link-alt primary-text"></i></a>'
  public readonly linkCron = '<a href="https://crontab.guru/" target="_blank" rel="noopener noreferrer"><i class="fa fa-external-link-alt primary-text"></i></a>'

  public async ngOnInit(): Promise<void> {
    await Promise.all([this.getPluginType(), this.loadPluginConfig(), this.loadBridgeConfigs()])
    this.canShowBridgeDebug = this.$settings.isFeatureEnabled('childBridgeDebugMode')
    this.loading = false
  }

  public handleIconError() {
    this.plugin.icon = this.defaultIcon
  }

  public onBlockChange(index: string) {
    this.selectedBlock = index
    this.currentlySelectedLink = this.accessoryBridgeLinks.find(link => link.index === index) || null
    this.currentBridgeHasLinks = this.accessoryBridgeLinks.some(link => link.usesIndex === index)
    this.bridgesAvailableForLink = []

    // Bridges available for link can only be accessory blocks
    if (this.configBlocks[Number(index)].accessory) {
      for (const [i, bridge] of Array.from(this.bridgeCache.entries())) {
        // Only include bridges that are enabled and not marked for deletion
        if (this.enabledBlocks[i] && !this.deleteBridges.some(b => b.id === bridge.username)) {
          if (i < Number(index)) {
            this.bridgesAvailableForLink.push({
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
  }

  public onLinkBridgeChange(username: string) {
    if (username) {
      // Get the index of the first block in the config with this bridge username
      const index = this.configBlocks.findIndex(block => block._bridge?.username === username)

      // Update the accessoryBridgeLinks
      this.accessoryBridgeLinks.push({
        index: this.selectedBlock,
        usesIndex: index.toString(),
        name: this.bridgeCache.get(index)?.name,
        port: this.bridgeCache.get(index)?.port,
        username,
      })

      // Update currently selected link
      this.currentlySelectedLink = this.accessoryBridgeLinks.find(link => link.index === this.selectedBlock) || null
      this.enabledBlocks[Number(this.selectedBlock)] = true

      // Update this block with the bridge details
      const block = this.configBlocks[Number(this.selectedBlock)]
      block._bridge = {
        username,
      }
    }
  }

  private async getPluginType() {
    try {
      const alias = await firstValueFrom(this.$api.get(`/plugins/alias/${encodeURIComponent(this.plugin.name)}`))
      this.isPlatform = alias.pluginType === 'platform'
    } catch (error) {
      this.$toastr.error(this.$translate.instant('plugins.config.load_error'), this.$translate.instant('toast.title_error'))
      this.$activeModal.close()
      console.error(error)
    }
  }

  private async loadPluginConfig() {
    try {
      this.configBlocks = await firstValueFrom(this.$api.get(`/config-editor/plugin/${encodeURIComponent(this.plugin.name)}`))
      for (const [i, block] of this.configBlocks.entries()) {
        if (block._bridge) {
          this.enabledBlocks[i] = true
        }

        if (block._bridge && block._bridge.username) {
          // For accessory plugin blocks, the username might be the same as a previous block
          const existingBridgeEntry = Array.from(this.bridgeCache.entries()).find(([, bridge]) => bridge.username === block._bridge.username)
          const existingBridgeIndex = existingBridgeEntry ? existingBridgeEntry[0] : -1
          const existingBridge = existingBridgeEntry ? existingBridgeEntry[1] : undefined
          if (existingBridge) {
            block._bridge.env = {}
            this.accessoryBridgeLinks.push({
              index: i.toString(),
              usesIndex: existingBridgeIndex.toString(),
              name: existingBridge.name,
              port: existingBridge.port,
              username: block._bridge.username,
            })
          } else {
            block._bridge.env = block._bridge.env || {}
            this.bridgeCache.set(i, block._bridge)
            await this.getDeviceInfo(block._bridge.username)

            // If the bridge does not have a name in the config, then override it from the pairing
            if (!block._bridge.name) {
              const info = this.deviceInfo.get(block._bridge.username)
              if (info) {
                block._bridge.name = info.displayName
              }
            }
            // Deep clone the bridge config to track original state
            this.originalBridges.push(JSON.parse(JSON.stringify(block._bridge)))
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
            this.matterEnabledBlocks[i] = true

            // Only cache port - name is now shared at _bridge level
            this.matterBridgeCache.set(i, { port: block._bridge.matter.port })
            this.originalMatterBridges.push({ port: block._bridge.matter.port })
            // Use username as key, just like HAP
            if (block._bridge.username) {
              await this.getMatterCommissioningInfo(block._bridge.username)
            }
          }
        }
      }

      // If the plugin has just been installed, and there are no existing bridges, enable all blocks
      if (this.justInstalled && this.bridgeCache.size === 0) {
        this.configBlocks.forEach((block, index) => {
          this.enabledBlocks[index] = true
          this.toggleExternalBridge(block, true, index.toString())
        })
      }

      // Check if the currently selected bridge has any links
      const currentBridgeLinks = this.accessoryBridgeLinks.find(link => link.username === this.bridgeCache.get(Number(this.selectedBlock))?.username)
      if (currentBridgeLinks) {
        this.currentBridgeHasLinks = true
      }

      // Initialize the currently selected link
      this.currentlySelectedLink = this.accessoryBridgeLinks.find(link => link.index === this.selectedBlock) || null

      // Initialize bridges available for link
      if (this.configBlocks[Number(this.selectedBlock)]?.accessory) {
        for (const [i, bridge] of Array.from(this.bridgeCache.entries())) {
          if (this.enabledBlocks[i] && !this.deleteBridges.some(b => b.id === bridge.username)) {
            if (i < Number(this.selectedBlock)) {
              this.bridgesAvailableForLink.push({
                index: i.toString(),
                usesIndex: this.selectedBlock,
                name: bridge.name,
                port: bridge.port,
                username: bridge.username,
              })
            }
          }
        }
      }
    } catch (error) {
      this.canConfigure = false
      console.error(error)
    }
  }

  public async toggleExternalBridge(block: any, enable: boolean, index: string) {
    if (enable) {
      const bridgeCache = this.bridgeCache.get(Number(index))
      const matterCache = this.matterBridgeCache.get(Number(index))

      // Always create HAP bridge configuration when HAP toggle is enabled
      block._bridge = {
        username: bridgeCache ? bridgeCache.username : this.generateUsername(),
        port: await this.getUnusedPort(),
        name: bridgeCache?.name || this.sanitizeBridgeName(this.plugin.displayName || this.plugin.name),
        model: bridgeCache?.model,
        manufacturer: bridgeCache?.manufacturer,
        firmwareRevision: bridgeCache?.firmwareRevision,
        debugModeEnabled: bridgeCache?.debugModeEnabled,
        env: bridgeCache?.env || {},
      }

      // Restore Matter configuration if it was previously cached (cached means it was enabled before disabling)
      // BUT only if the user didn't explicitly disable Matter before disabling the child bridge
      if (matterCache && !this.matterExplicitlyDisabledBeforeChildBridge.has(Number(index))) {
        // Only restore port - name is shared at _bridge level
        // Use cached port if available, otherwise get a new Matter port
        block._bridge.matter = {
          port: matterCache.port ?? await this.getUnusedMatterPort(),
        }

        // Also restore the enabled state
        this.matterEnabledBlocks[Number(index)] = true

        // Restore Matter commissioning info
        if (block._bridge.username) {
          // Check if this bridge was originally enabled (has existing commissioning info on backend)
          const wasOriginallyEnabled = this.originalMatterBridges.some(m =>
            m.port === matterCache.port,
          )

          if (wasOriginallyEnabled) {
            // Fetch full commissioning info from backend since it still exists
            await this.getMatterCommissioningInfo(block._bridge.username)
          } else {
            // New Matter bridge - set partial commissioning info with allocated port
            // No setupUri triggers "restart homebridge" message in template
            this.matterDeviceInfo.set(block._bridge.username, { port: matterCache.port } as any)
          }
        }

        // Remove from Matter deletion list since we're restoring it
        if (block._bridge.username) {
          const identifier = block._bridge.username.replace(/[^a-z0-9]/gi, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')
          this.deleteMatterBridges = this.deleteMatterBridges.filter(b => b.identifier !== identifier)
        }
      }

      if (this.deleteBridges.some(b => b.id === block._bridge.username)) {
        this.deleteBridges = this.deleteBridges.filter(b => b.id !== block._bridge.username)
      }

      // Clean up the tracking flag
      this.matterExplicitlyDisabledBeforeChildBridge.delete(Number(index))

      this.bridgeCache.set(Number(index), block._bridge)
      await this.getDeviceInfo(block._bridge.username)
    } else {
      // Set enabled state to false
      this.enabledBlocks[Number(index)] = false

      // Cache Matter configuration before deleting if Matter is enabled
      if (block._bridge?.matter && this.matterEnabledBlocks[Number(index)]) {
        // Only cache port - name is shared at _bridge level
        this.matterBridgeCache.set(Number(index), {
          port: block._bridge.matter.port,
        })
      }

      // Check for linked bridges
      if (this.accessoryBridgeLinks.some(link => link.index === index)) {
        this.accessoryBridgeLinks = this.accessoryBridgeLinks.filter(link => link.index !== index)
        this.currentlySelectedLink = null
      } else {
        // Store unused child bridge id for deletion, so no bridges are orphaned
        const originalBridge = this.originalBridges.find(b => b.username === block._bridge.username)
        if (originalBridge) {
          // Avoid duplicates
          if (!this.deleteBridges.some(b => b.id === block._bridge.username)) {
            const info = this.deviceInfo.get(block._bridge.username)
            this.deleteBridges.push({
              id: block._bridge.username,
              bridgeName: block._bridge.name || originalBridge.displayName,
              paired: info ? info._isPaired : false,
            })
          }
        }

        // Check if Matter was already disabled by the user before we disabled the child bridge
        if (block._bridge?.username) {
          const identifier = block._bridge.username.replace(/[^a-z0-9]/gi, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')
          const matterAlreadyDisabled = this.deleteMatterBridges.some(b => b.identifier === identifier)

          if (matterAlreadyDisabled) {
            // User explicitly disabled Matter before disabling child bridge
            // Track this so we don't restore Matter when re-enabling child bridge
            this.matterExplicitlyDisabledBeforeChildBridge.add(Number(index))
          }
        }

        // Also mark Matter for deletion if it was originally enabled AND not already in deletion list
        if (block._bridge?.matter && block._bridge.username) {
          const wasOriginallyEnabled = this.originalMatterBridges.some(m =>
            m.port === block._bridge.matter.port,
          )

          if (wasOriginallyEnabled) {
            const identifier = block._bridge.username.replace(/[^a-z0-9]/gi, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')
            // Avoid duplicates
            if (!this.deleteMatterBridges.some(b => b.identifier === identifier)) {
              // Store name before deleting block._bridge
              const name = block._bridge.name || this.plugin.displayName || this.plugin.name
              this.deleteMatterBridges.push({
                username: block._bridge.username,
                identifier,
                name,
              })
            }
          }
        }
      }

      // Also disable the Matter toggle state when disabling the child bridge
      this.matterEnabledBlocks[Number(index)] = false

      delete block._bridge
    }

    // Figure out if we are deleting at least one paired bridge
    this.deletingPairedBridge = this.deleteBridges.some(b => b.paired)
  }

  /**
   * Check if any validation errors exist across all enabled bridges
   */
  public get hasValidationErrors(): boolean {
    for (const [index, block] of this.configBlocks.entries()) {
      if (this.enabledBlocks[index] && block._bridge?.username) {
        if (this.getHapNameValidationError(index.toString()) || this.getHapPortValidationError(index.toString())) {
          return true
        }
      }
    }
    return false
  }

  private async getUnusedPort() {
    try {
      const lookup = await firstValueFrom(this.$api.get('/server/port/new'))
      return lookup.port
    } catch (e) {
      return Math.floor(Math.random() * (60000 - 30000 + 1) + 30000)
    }
  }

  private async getUnusedMatterPort() {
    try {
      const lookup = await firstValueFrom(this.$api.get('/server/port/new/matter'))
      return lookup.port
    } catch (e) {
      // Fallback to Matter port range if API call fails
      return Math.floor(Math.random() * (5541 - 5530 + 1) + 5530)
    }
  }

  private async getDeviceInfo(username: string) {
    try {
      this.deviceInfo.set(username, await firstValueFrom(this.$api.get(`/server/pairings/${username.replace(/:/g, '')}`)))
    } catch (error) {
      console.error(error)
      this.deviceInfo.set(username, false)
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
    let sanitized = name.replace(/[^\p{L}\p{N} ']/gu, '')

    // Remove leading/trailing spaces and apostrophes
    sanitized = sanitized.replace(/^[ ']+|[ ']+$/g, '')

    // Ensure it starts and ends with letter or number by removing invalid start/end chars
    sanitized = sanitized.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '')

    return sanitized
  }

  private async getMatterCommissioningInfo(username: string) {
    try {
      // Get all child bridges from the status endpoint
      const childBridges = await firstValueFrom(this.$api.get('/status/homebridge/child-bridges'))

      // Find the bridge matching this username
      const bridge = childBridges.find((b: any) => b.username === username)

      if (bridge && bridge.matterSetupUri) {
        // Store the Matter commissioning info
        this.matterDeviceInfo.set(username, {
          setupUri: bridge.matterSetupUri,
          pin: bridge.matterPin,
          serialNumber: bridge.matterSerialNumber,
          commissioned: bridge.matterCommissioned,
          deviceCount: bridge.matterDeviceCount,
          port: bridge.matterConfig?.port,
        })
      } else {
        // Bridge found but Matter not yet started, or QR code not available yet
        // Set partial info so template knows to wait for restart
        this.matterDeviceInfo.set(username, {
          port: bridge?.matterConfig?.port,
        } as any)
      }
    } catch (error) {
      console.error(error)
      // Set empty object so restart placeholder shows (instead of null which breaks template conditions)
      this.matterDeviceInfo.set(username, {} as any)
    }
  }

  public async toggleMatterBridge(block: any, enable: boolean, index: string) {
    // Matter is only supported for platform-based plugins
    if (block.accessory) {
      this.matterEnabledBlocks[Number(index)] = false
      return
    }

    if (enable) {
      const matterCache = this.matterBridgeCache.get(Number(index))

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

      // Only store port in matter config - name is now shared at _bridge level
      block._bridge.matter = {
        port,
      }

      // Update cache with current values (only port)
      this.matterBridgeCache.set(Number(index), { port })

      // If this was marked for deletion, remove it from the delete list
      if (block._bridge.username) {
        const identifier = block._bridge.username.replace(/[^a-z0-9]/gi, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')
        this.deleteMatterBridges = this.deleteMatterBridges.filter(b => b.identifier !== identifier)

        // Also clear the "explicitly disabled" tracking flag since user is now enabling Matter
        this.matterExplicitlyDisabledBeforeChildBridge.delete(Number(index))

        // Check if this bridge was originally enabled (has existing commissioning info on backend)
        const wasOriginallyEnabled = this.originalMatterBridges.some(m =>
          m.port === port,
        )

        if (wasOriginallyEnabled) {
          // Fetch full commissioning info from backend since it still exists
          await this.getMatterCommissioningInfo(block._bridge.username)
        } else {
          // New Matter bridge - set partial commissioning info with allocated port
          // No setupUri triggers "restart homebridge" message in template
          this.matterDeviceInfo.set(block._bridge.username, { port } as any)
        }
      }
    } else {
      // Set enabled state to false
      this.matterEnabledBlocks[Number(index)] = false

      // Track for deletion if this was originally enabled
      const wasOriginallyEnabled = this.originalMatterBridges.some(m =>
        block._bridge?.matter && m.port === block._bridge.matter.port,
      )

      // Cache the current values before deleting (for potential restore) - only port
      if (block._bridge && block._bridge.matter) {
        this.matterBridgeCache.set(Number(index), {
          port: block._bridge.matter.port,
        })
        delete block._bridge.matter
      }

      // Clear commissioning info when disabling
      if (block._bridge?.username) {
        this.matterDeviceInfo.set(block._bridge.username, null)

        if (wasOriginallyEnabled) {
          // Sanitize username to create identifier (same logic as backend)
          const identifier = block._bridge.username.replace(/[^a-z0-9]/gi, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')
          // Get name from block._bridge (still available at this point)
          const name = block._bridge.name || this.plugin.displayName || this.plugin.name
          this.deleteMatterBridges.push({
            username: block._bridge.username,
            identifier,
            name,
          })
        }
      }

      // Clean up if _bridge is now empty
      if (block._bridge && Object.keys(block._bridge).length === 0) {
        delete block._bridge
      }
    }
  }

  public getMatterPortValidationError(index: string): boolean {
    const block = this.configBlocks[Number(index)]
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
    const block = this.configBlocks[Number(index)]
    if (!block._bridge?.name) {
      return false // Empty is valid
    }

    const name = block._bridge.name
    // HAP name validation: must start and end with letter/number, can contain letters, numbers, spaces, and apostrophes
    // https://github.com/homebridge/HAP-NodeJS/blob/ee41309fd9eac383cdcace39f4f6f6a3d54396f3/src/lib/util/checkName.ts#L12
    const hapNamePattern = /^[\p{L}\p{N}][\p{L}\p{N} ']*[\p{L}\p{N}]$/u
    return !hapNamePattern.test(name)
  }

  public getHapPortValidationError(index: string): boolean {
    const block = this.configBlocks[Number(index)]
    const port = block._bridge?.port

    if (!port && port !== 0) {
      return false // Empty is valid (optional - will be auto-allocated)
    }

    if (typeof port !== 'number' || !Number.isInteger(port) || port < 1025 || port > 65533) {
      return true
    }

    // Check for port conflicts with other enabled bridges
    for (const [i, otherBlock] of this.configBlocks.entries()) {
      if (i.toString() !== index && this.enabledBlocks[i] && otherBlock._bridge?.port === port) {
        return true
      }
    }

    // Check if HAP port conflicts with Matter port on same bridge
    const matterPort = block._bridge?.matter?.port
    return matterPort && port === matterPort
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

  public async save() {
    this.saveInProgress = true

    try {
      // Validate HAP and Matter configs before saving
      for (const [index, block] of this.configBlocks.entries()) {
        // HAP validation
        if (block._bridge?.username) {
          if (this.getHapNameValidationError(index.toString())) {
            this.$toastr.error(
              this.$translate.instant('plugins.bridge.name_error'),
              this.$translate.instant('toast.title_error'),
            )
            this.saveInProgress = false
            return
          }

          if (this.getHapPortValidationError(index.toString())) {
            this.$toastr.error(
              this.$translate.instant('plugins.bridge.port_error', {
                type: 'HAP',
              }),
              this.$translate.instant('toast.title_error'),
            )
            this.saveInProgress = false
            return
          }
        }

        // Matter validation (for both Matter-only and HAP+Matter)
        if (this.matterEnabledBlocks[index]) {
          if (this.getMatterPortValidationError(index.toString())) {
            this.$toastr.error(
              this.$translate.instant('plugins.bridge.port_error', {
                type: 'Matter',
              }),
              this.$translate.instant('toast.title_error'),
            )
            this.saveInProgress = false
            return
          }
        }

        // Normalize the matter config (trim strings, remove empty values)
        this.normalizeMatterConfig(block)
      }

      await firstValueFrom(this.$api.post(`/config-editor/plugin/${encodeURIComponent(this.plugin.name)}`, this.configBlocks))

      // Delete unused bridges, so no bridges are orphaned
      for (const bridge of this.deleteBridges) {
        try {
          await firstValueFrom(this.$api.delete(`/server/pairings/${bridge.id.replace(/:/g, '')}`))
        } catch (error) {
          console.error(error)
          this.$toastr.error(this.$translate.instant('settings.reset_bridge.error'), this.$translate.instant('toast.title_error'))
        }
      }

      // Delete unused Matter bridges (storage cleanup)
      // Skip bridges that were already deleted via the HAP pairing endpoint above (it deletes Matter info too)
      const matterBridgesToDelete = this.deleteMatterBridges.filter(
        mb => !this.deleteBridges.some(b => b.id === mb.username),
      )
      for (const matterBridge of matterBridgesToDelete) {
        try {
          const deviceId = matterBridge.username.replace(/:/g, '')
          await firstValueFrom(this.$api.delete(`/server/pairings/${deviceId}/matter`))
        } catch (error) {
          console.error(error)
          this.$toastr.error(this.$translate.instant('settings.reset_bridge.error'), this.$translate.instant('toast.title_error'))
        }
      }

      // Check what has changed
      const cronHasChanged = this.hasScheduledRestartCronChanged()
      const hideAlertsChanged = this.hasHideAlertsChanged()
      const bridgeConfigChanged = this.hasBridgeConfigChanged()
      const bridgesDeleted = this.deleteBridges.length > 0 || this.deleteMatterBridges.length > 0
      const nothingChanged = !cronHasChanged && !hideAlertsChanged && !bridgeConfigChanged && !bridgesDeleted
      const onlyHideAlertsChanged = hideAlertsChanged && !cronHasChanged && !bridgeConfigChanged && !bridgesDeleted

      // Save hide alert settings only for bridges that changed and are not being deleted
      for (const [username, bridgeConfig] of this.bridgeConfigs.entries()) {
        // Skip bridges that are being deleted
        if (this.deleteBridges.some(b => b.id === username)) {
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
        if (this.deleteBridges.some(b => b.id === username)) {
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
          await firstValueFrom(this.$api.put('/platform-tools/hb-service/set-full-service-restart-flag', {}))
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
        })
      }
    } catch (error) {
      console.error(error)
      this.$toastr.error(this.$translate.instant('config.failed_to_save_config'), this.$translate.instant('toast.title_error'))
    } finally {
      this.saveInProgress = false
    }
  }

  public openPluginConfig() {
    // Close the existing modal
    this.$activeModal.close()

    // Open the plugin config modal
    void this.$plugin.settings({
      name: this.plugin.name,
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
    // Check if number of config blocks changed
    if (this.configBlocks.length !== this.originalBridges.length) {
      return true
    }

    // Check if any bridge config has changed
    for (const [, block] of this.configBlocks.entries()) {
      if (!block._bridge) {
        continue
      }

      const original = this.originalBridges.find(b => b.username === block._bridge.username)
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
      await firstValueFrom(this.$api.put(endpoint, { value }))
      this.updateLocalBridgeConfig(normalizedUsername, { hideHapAlert: value })
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
      await firstValueFrom(this.$api.put(
        `/config-editor/ui/bridges/${encodeURIComponent(normalizedUsername)}/scheduled-restart-cron`,
        { value: value || null },
      ))

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

import type { DeviceInfo, PluginSchema } from '@/app/core/manage-plugins/manage-plugins.interfaces'

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
  private $plugins = inject(ManagePluginsService)
  private $router = inject(Router)
  private $settings = inject(SettingsService)
  private $toastr = inject(ToastrService)
  private $translate = inject(TranslateService)

  @Input() plugin: any
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
  public saveInProgress = false
  public canShowBridgeDebug = false
  public deleteBridges: { id: string, bridgeName: string, paired: boolean }[] = []
  public deletingPairedBridge: boolean = false
  public accessoryBridgeLinks: { index: string, usesIndex: string, name: string, username: string, port: number }[] = []
  public bridgesAvailableForLink: { index: string, usesIndex: string, name: string, username: string, port: number }[] = []
  public currentlySelectedLink: { index: string, usesIndex: string, name: string, username: string, port: number } | null = null
  public currentBridgeHasLinks: boolean = false
  public readonly linkChildBridges = '<a href="https://github.com/homebridge/homebridge/wiki/Child-Bridges" target="_blank"><i class="fas fa-fw fa-external-link-alt primary-text"></i></a>'
  public readonly linkDebug = '<a href="https://github.com/homebridge/homebridge-config-ui-x/wiki/Debug-Common-Values" target="_blank"><i class="fa fa-fw fa-external-link-alt primary-text"></i></a>'

  public async ngOnInit(): Promise<void> {
    await Promise.all([this.getPluginType(), this.loadPluginConfig()])
    this.canShowBridgeDebug = this.$settings.env.homebridgeVersion.startsWith('2')
    this.loading = false
  }

  public onBlockChange(index: string) {
    this.selectedBlock = index
    this.currentlySelectedLink = this.accessoryBridgeLinks.find(link => link.index === index) || null
    this.currentBridgeHasLinks = this.accessoryBridgeLinks.some(link => link.usesIndex === index)
    this.bridgesAvailableForLink = []

    // Bridges available for link can only be accessory blocks
    if (this.configBlocks[Number(index)].accessory) {
      for (const [i, bridge] of Array.from(this.bridgeCache.entries())) {
        if (!this.deleteBridges.some(b => b.id === bridge.username)) {
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
        if (block._bridge && block._bridge.username) {
          this.enabledBlocks[i] = true

          // For accessory plugin blocks, the username might be the same as a previous block
          const existingBridgeIndex = Array.from(this.bridgeCache.values()).findIndex(bridge => bridge.username === block._bridge.username)
          const existingBridge = existingBridgeIndex !== -1 ? Array.from(this.bridgeCache.values())[existingBridgeIndex] : undefined
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
              block._bridge.name = this.deviceInfo[block._bridge.username]?.displayName
            }
            this.originalBridges.push(block._bridge)
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
    } catch (error) {
      this.canConfigure = false
      console.error(error)
    }
  }

  public async toggleExternalBridge(block: any, enable: boolean, index: string) {
    if (enable) {
      const bridgeCache = this.bridgeCache.get(Number(index))

      block._bridge = {
        username: bridgeCache ? bridgeCache.username : this.generateUsername(),
        port: await this.getUnusedPort(),
        name: bridgeCache?.name,
        model: bridgeCache?.model,
        manufacturer: bridgeCache?.manufacturer,
        firmwareRevision: bridgeCache?.firmwareRevision,
        debugModeEnabled: bridgeCache?.debugModeEnabled,
        env: bridgeCache?.env,
      }

      if (this.deleteBridges.some(b => b.id === block._bridge.username)) {
        this.deleteBridges = this.deleteBridges.filter(b => b.id !== block._bridge.username)
      }

      this.bridgeCache.set(Number(index), block._bridge)
      await this.getDeviceInfo(block._bridge.username)
    } else {
      // Check for linked bridges
      if (this.accessoryBridgeLinks.some(link => link.index === index)) {
        this.accessoryBridgeLinks = this.accessoryBridgeLinks.filter(link => link.index !== index)
        this.currentlySelectedLink = null
      } else {
        // Store unused child bridge id for deletion, so no bridges are orphaned
        const originalBridge = this.originalBridges.find(b => b.username === block._bridge.username)
        if (originalBridge) {
          this.deleteBridges.push({
            id: block._bridge.username,
            bridgeName: block._bridge.name || originalBridge.displayName,
            paired: this.deviceInfo[block._bridge.username]?._isPaired,
          })
        }
      }

      delete block._bridge
    }

    // Figure out if we are deleting at least one paired bridge
    this.deletingPairedBridge = this.deleteBridges.some(b => b.paired)
  }

  private async getUnusedPort() {
    this.saveInProgress = true
    try {
      const lookup = await firstValueFrom(this.$api.get('/server/port/new'))
      return lookup.port
    } catch (e) {
      return Math.floor(Math.random() * (60000 - 30000 + 1) + 30000)
    } finally {
      this.saveInProgress = false
    }
  }

  private async getDeviceInfo(username: string) {
    try {
      this.deviceInfo[username] = await firstValueFrom(this.$api.get(`/server/pairings/${username.replace(/:/g, '')}`))
    } catch (error) {
      console.error(error)
      this.deviceInfo[username] = false
    }
  }

  public async save() {
    this.saveInProgress = true

    try {
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

      this.$activeModal.close()
      this.$modal.open(RestartHomebridgeComponent, {
        size: 'lg',
        backdrop: 'static',
      })
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
    this.$plugins.settings({
      name: this.plugin.name,
      settingsSchema: true,
      links: {},
    })
  }

  private generateUsername() {
    const hexDigits = '0123456789ABCDEF'
    let username = '0E:'
    for (let i = 0; i < 5; i++) {
      username += hexDigits.charAt(Math.round(Math.random() * 15))
      username += hexDigits.charAt(Math.round(Math.random() * 15))
      if (i !== 4) {
        username += ':'
      }
    }
    return username
  }

  public openFullConfigEditor() {
    this.$router.navigate(['/config'])
    this.$activeModal.close()
  }

  public dismissModal() {
    this.$activeModal.dismiss('Dismiss')
  }

  public closeModal() {
    this.$activeModal.close('Dismiss')
  }
}

import { ChangeDetectionStrategy, Component, inject, OnDestroy, OnInit, signal } from '@angular/core'

import { ServiceTypeX, SmartAutomation } from '@/app/core/accessories/accessories.interfaces'
import { AccessoriesService } from '@/app/core/accessories/accessories.service'
import { AuthService } from '@/app/core/auth/auth.service'
import { ApiService } from '@/app/core/communication/api.service'
import { SettingsService } from '@/app/core/ui/settings.service'
import { SmartAutomationFormComponent } from '@/app/modules/smart-automations/smart-automation-form/smart-automation-form.component'
import { SmartAutomationListComponent } from '@/app/modules/smart-automations/smart-automation-list/smart-automation-list.component'

interface ConfigPlatformBlock {
  platform: string
  name?: string
  _bridge?: {
    username?: string
    pin?: string
    name?: string
  }
  smartAutomations?: SmartAutomation[]
  [key: string]: any
}

const SMART_AUTOMATION_PLATFORM = 'smart-automation'

@Component({
  selector: 'app-smart-automations',
  imports: [
    SmartAutomationFormComponent,
    SmartAutomationListComponent,
  ],
  standalone: true,
  templateUrl: './smart-automations.component.html',
  styleUrl: './smart-automations.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SmartAutomationsComponent implements OnInit, OnDestroy {
  private $accessories = inject(AccessoriesService)
  private $api = inject(ApiService)
  private $auth = inject(AuthService)
  private $settings = inject(SettingsService)

  public isAdmin = this.$auth.user.admin
  public readonly smartAutomations = signal<SmartAutomation[]>([])
  public readonly selectedLightUniqueIds = signal<string[]>([])
  public smartAutomationDraft: Partial<SmartAutomation> = {
    type: 'smart-light-group',
    uniqueIds: [],
    enabled: true,
  }

  public get rooms(): Array<{ name: string, isDefault?: boolean, services: ServiceTypeX[] }> {
    return this.$accessories.rooms()
  }

  public ngOnInit(): void {
    this.$settings.setPageTitle('Smart Automation')

    void this.$accessories.start()
      .then(() => this.loadSmartAutomationConfig())
      .catch((error) => {
        console.error(error)
      })
  }

  public ngOnDestroy(): void {
    this.$accessories.stop()
  }

  public toggleLightSelection(uniqueId: string, selected: boolean): void {
    const next = selected
      ? [...new Set([...this.selectedLightUniqueIds(), uniqueId])]
      : this.selectedLightUniqueIds().filter(id => id !== uniqueId)
    this.selectedLightUniqueIds.set(next)
  }

  public editSmartAutomation(automation: SmartAutomation): void {
    this.smartAutomationDraft = { ...automation, uniqueIds: [...automation.uniqueIds] }
    this.selectedLightUniqueIds.set([...automation.uniqueIds])
  }

  public async saveSmartAutomation(): Promise<void> {
    try {
      const draft = {
        ...this.smartAutomationDraft,
        uniqueIds: [...new Set(this.selectedLightUniqueIds())],
        type: 'smart-light-group' as const,
        enabled: this.smartAutomationDraft.enabled ?? true,
      }

      const saved = {
        ...draft,
        id: draft.id || this.generateAutomationId(),
        name: draft.name?.trim(),
      } as SmartAutomation
      if (!saved.name || !saved.uniqueIds.length) {
        return
      }
      const current = this.smartAutomations()
      const exists = current.some(item => item.id === saved.id)
      this.smartAutomations.set(exists
        ? current.map(item => item.id === saved.id ? saved : item)
        : [...current, saved],
      )
      await this.syncSmartAutomationChildBridgeConfig()
      this.resetSmartAutomationDraft()
    } catch (error) {
      console.error(error)
    }
  }

  public async deleteSmartAutomation(id: string): Promise<void> {
    try {
      this.smartAutomations.set(this.smartAutomations().filter(x => x.id !== id))
      if (this.smartAutomationDraft.id === id) {
        this.resetSmartAutomationDraft()
      }
      await this.syncSmartAutomationChildBridgeConfig()
    } catch (error) {
      console.error(error)
    }
  }

  public async setSmartAutomationEnabled(automation: SmartAutomation, enabled: boolean): Promise<void> {
    try {
      const saved = {
        ...automation,
        enabled,
      }
      this.smartAutomations.update(current => current.map(item => item.id === saved.id ? saved : item))
      await this.syncSmartAutomationChildBridgeConfig()
    } catch (error) {
      console.error(error)
    }
  }

  private async loadSmartAutomationConfig(): Promise<void> {
    if (!this.isAdmin) {
      return
    }

    try {
      const configBlocks = await this.$api.get<ConfigPlatformBlock[]>('/config-editor/plugin/homebridge-config-ui-x')
      const smartAutomationBlock = configBlocks.find(block => block.platform === SMART_AUTOMATION_PLATFORM)
        || configBlocks.find(block => block.platform === 'config')
      const switches = (smartAutomationBlock?.smartAutomations || []).filter(a => typeof a?.name === 'string')
      this.smartAutomations.set(switches)
    } catch (error) {
      console.error(error)
    }
  }

  private async syncSmartAutomationChildBridgeConfig(): Promise<void> {
    if (!this.isAdmin) {
      return
    }

    try {
      const configBlocks = await this.$api.get<ConfigPlatformBlock[]>('/config-editor/plugin/homebridge-config-ui-x')
      const engineIndex = configBlocks.findIndex(block => block.platform === SMART_AUTOMATION_PLATFORM)
      const uiConfigBlock = configBlocks.find(block => block.platform === 'config')
      const current = engineIndex >= 0 ? configBlocks[engineIndex] : null
      const bridgeSource = current?._bridge || uiConfigBlock?._bridge

      if (!current && !uiConfigBlock) {
        return
      }

      const nextBridge = {
        ...bridgeSource,
        name: 'Smart Automation',
        username: bridgeSource?.username || this.generateBridgeUsername(),
        pin: bridgeSource?.pin || this.generateBridgePin(),
      }

      const nextBlock = {
        ...(current || {}),
        platform: SMART_AUTOMATION_PLATFORM,
        name: current?.name || 'Smart Automation',
        _bridge: nextBridge,
        smartAutomations: this.smartAutomations().map(automation => ({ ...automation })),
      }
      if (engineIndex >= 0) {
        configBlocks[engineIndex] = nextBlock
      } else {
        configBlocks.push(nextBlock)
      }

      await this.$api.post('/config-editor/plugin/homebridge-config-ui-x', configBlocks)
    } catch (error) {
      console.error(error)
    }
  }

  private generateBridgePin(): string {
    const random = new Uint8Array(8)
    globalThis.crypto.getRandomValues(random)
    const code = `${(random[0] % 9) + 1}${Array.from(random.slice(1), value => (value % 10).toString()).join('')}`
    return `${code.slice(0, 3)}-${code.slice(3, 5)}-${code.slice(5, 8)}`
  }

  private generateAutomationId(): string {
    const bytes = new Uint8Array(16)
    globalThis.crypto.getRandomValues(bytes)
    bytes[6] = (bytes[6] & 0x0F) | 0x40
    bytes[8] = (bytes[8] & 0x3F) | 0x80
    const hex = Array.from(bytes, value => value.toString(16).padStart(2, '0')).join('')
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
  }

  private generateBridgeUsername(): string {
    const random = new Uint8Array(5)
    globalThis.crypto.getRandomValues(random)
    const pairs = Array.from(random, value => value.toString(16).padStart(2, '0').toUpperCase())
    return `0E:${pairs.join(':')}`
  }

  private resetSmartAutomationDraft(): void {
    this.smartAutomationDraft = {
      type: 'smart-light-group',
      uniqueIds: [],
      enabled: true,
    }
    this.selectedLightUniqueIds.set([])
  }
}

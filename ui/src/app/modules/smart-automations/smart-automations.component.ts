import { ChangeDetectionStrategy, Component, DestroyRef, inject, OnDestroy, OnInit, signal } from '@angular/core'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import { firstValueFrom } from 'rxjs'

import { ServiceTypeX, SmartAutomation } from '@/app/core/accessories/accessories.interfaces'
import { AccessoriesService } from '@/app/core/accessories/accessories.service'
import { AuthService } from '@/app/core/auth/auth.service'
import { ApiService } from '@/app/core/communication/api.service'
import { IoNamespace, WsService } from '@/app/core/communication/ws.service'
import { ChildBridgeStatusResponse } from '@/app/core/server.interfaces'
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

@Component({
  selector: 'app-smart-automations',
  imports: [
    SmartAutomationFormComponent,
    SmartAutomationListComponent,
  ],
  standalone: true,
  templateUrl: './smart-automations.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SmartAutomationsComponent implements OnInit, OnDestroy {
  private $accessories = inject(AccessoriesService)
  private $api = inject(ApiService)
  private $auth = inject(AuthService)
  private $settings = inject(SettingsService)
  private $ws = inject(WsService)
  private destroyRef = inject(DestroyRef)
  private ioChild!: IoNamespace

  public isAdmin = this.$auth.user.admin
  public readonly smartAutomations = signal<SmartAutomation[]>([])
  public readonly automationSwitchStates = signal<Record<string, boolean>>({})
  public readonly smartAutomationChildBridge = signal<ChildBridgeStatusResponse | null>(null)
  public readonly configuredChildBridge = signal<ConfigPlatformBlock['_bridge'] | null>(null)
  public readonly configuredChildBridgeSwitches = signal<SmartAutomation[]>([])
  public readonly configuredChildBridgeSwitchNames = signal<string>('')
  public readonly selectedLightUniqueIds = signal<string[]>([])
  public smartAutomationDraft: Partial<SmartAutomation> = {
    type: 'smart-light-group',
    restoreAfterMs: 30000,
    uniqueIds: [],
    enabled: true,
  }

  private automationSwitchResetTimers = new Map<string, ReturnType<typeof setTimeout>>()

  public get rooms(): Array<{ name: string, isDefault?: boolean, services: ServiceTypeX[] }> {
    return this.$accessories.rooms()
  }

  public ngOnInit(): void {
    this.$settings.setPageTitle('Smart Automation')

    void this.$accessories.start()
      .then(() => this.loadSmartAutomations())
      .catch((error) => {
        console.error(error)
      })

    this.setupSmartAutomationChildBridgeMonitoring()
  }

  public ngOnDestroy(): void {
    this.$accessories.stop()
    this.automationSwitchResetTimers.forEach(timer => clearTimeout(timer))
    this.automationSwitchResetTimers.clear()
    this.ioChild?.end?.()
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

      const saved = await this.$accessories.saveSmartAutomation(draft)
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
      await this.$accessories.deleteSmartAutomation(id)
      this.smartAutomations.set(this.smartAutomations().filter(x => x.id !== id))
      this.clearAutomationSwitchState(id)
      if (this.smartAutomationDraft.id === id) {
        this.resetSmartAutomationDraft()
      }
      await this.syncSmartAutomationChildBridgeConfig()
    } catch (error) {
      console.error(error)
    }
  }

  public runSmartAutomation(automation: SmartAutomation): void {
    this.$accessories.runSmartLightGroupAutomation(automation.uniqueIds, automation.restoreAfterMs)
  }

  public toggleAutomationSwitch(automation: SmartAutomation, enabled: boolean): void {
    if (!automation.enabled) {
      this.setAutomationSwitchState(automation.id, false)
      return
    }

    this.setAutomationSwitchState(automation.id, enabled)

    if (!enabled) {
      this.clearAutomationResetTimer(automation.id)
      return
    }

    this.runSmartAutomation(automation)
    this.clearAutomationResetTimer(automation.id)
    const resetAfterMs = Number.isInteger(automation.restoreAfterMs) && automation.restoreAfterMs > 0
      ? automation.restoreAfterMs
      : 30000

    const timer = setTimeout(() => {
      this.setAutomationSwitchState(automation.id, false)
      this.clearAutomationResetTimer(automation.id)
    }, resetAfterMs)
    this.automationSwitchResetTimers.set(automation.id, timer)
  }

  public async setSmartAutomationEnabled(automation: SmartAutomation, enabled: boolean): Promise<void> {
    try {
      const saved = await this.$accessories.saveSmartAutomation({
        ...automation,
        enabled,
      })
      this.smartAutomations.update(current => current.map(item => item.id === saved.id ? saved : item))
      if (!enabled) {
        this.clearAutomationSwitchState(automation.id)
      }
      await this.syncSmartAutomationChildBridgeConfig()
    } catch (error) {
      console.error(error)
    }
  }

  public async restartSmartAutomationChildBridge(): Promise<void> {
    const bridge = this.smartAutomationChildBridge()
    if (!bridge?.username || !this.ioChild?.request) {
      return
    }

    try {
      await firstValueFrom(this.ioChild.request('restart-child-bridge', bridge.username))
    } catch (error) {
      console.error(error)
    }
  }

  public async startSmartAutomationChildBridge(): Promise<void> {
    const bridge = this.smartAutomationChildBridge()
    if (!bridge?.username || !this.ioChild?.request) {
      return
    }

    try {
      await firstValueFrom(this.ioChild.request('start-child-bridge', bridge.username))
    } catch (error) {
      console.error(error)
    }
  }

  public async stopSmartAutomationChildBridge(): Promise<void> {
    const bridge = this.smartAutomationChildBridge()
    if (!bridge?.username || !this.ioChild?.request) {
      return
    }

    try {
      await firstValueFrom(this.ioChild.request('stop-child-bridge', bridge.username))
    } catch (error) {
      console.error(error)
    }
  }

  public async configureSmartAutomationChildBridge(): Promise<void> {
    await this.syncSmartAutomationChildBridgeConfig()
  }

  private setupSmartAutomationChildBridgeMonitoring(): void {
    this.ioChild = this.$ws.connectToNamespace('child-bridges')
    this.ioChild.connected!.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      this.ioChild.socket.emit('monitor-child-bridge-status')
      this.fetchChildBridges()
    })

    this.ioChild.socket.on('child-bridge-status-update', (data: ChildBridgeStatusResponse) => {
      this.updateSmartAutomationChildBridge([data])
    })
  }

  private fetchChildBridges(): void {
    this.ioChild.request('get-homebridge-child-bridge-status').subscribe((data: ChildBridgeStatusResponse[]) => {
      this.updateSmartAutomationChildBridge(data, true)
    })
  }

  private updateSmartAutomationChildBridge(bridges: ChildBridgeStatusResponse[], resetIfMissing = false): void {
    const smartAutomationBridge = bridges.find(bridge =>
      bridge.plugin === 'homebridge-config-ui-x'
      && bridge.name?.toLowerCase() === 'smart automation',
    )
    if (smartAutomationBridge) {
      this.smartAutomationChildBridge.set(smartAutomationBridge)
    } else if (resetIfMissing) {
      this.smartAutomationChildBridge.set(null)
    }
  }

  private async loadSmartAutomations(): Promise<void> {
    try {
      this.smartAutomations.set(await this.$accessories.getSmartAutomations())
      await this.loadSmartAutomationChildBridgeConfig()
    } catch (error) {
      console.error(error)
    }
  }

  private async loadSmartAutomationChildBridgeConfig(): Promise<void> {
    if (!this.isAdmin) {
      return
    }

    try {
      const configBlocks = await this.$api.get<ConfigPlatformBlock[]>('/config-editor/plugin/homebridge-config-ui-x')
      const uiConfigBlock = configBlocks.find(block => block.platform === 'config')
      const switches = (uiConfigBlock?.smartAutomations || []).filter(a => typeof a?.name === 'string')
      this.configuredChildBridge.set(uiConfigBlock?._bridge || null)
      this.configuredChildBridgeSwitches.set(switches)
      this.configuredChildBridgeSwitchNames.set(switches.map(automation => automation.name).join(', '))
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
      const uiConfigIndex = configBlocks.findIndex(block => block.platform === 'config')
      if (uiConfigIndex === -1) {
        return
      }

      const current = configBlocks[uiConfigIndex]
      const nextBridge = {
        ...current._bridge,
        name: 'Smart Automation',
        username: current._bridge?.username || this.generateBridgeUsername(),
        pin: current._bridge?.pin || this.generateBridgePin(),
      }

      configBlocks[uiConfigIndex] = {
        ...current,
        _bridge: nextBridge,
        smartAutomations: this.smartAutomations().map(automation => ({ ...automation })),
      }

      await this.$api.post('/config-editor/plugin/homebridge-config-ui-x', configBlocks)
      this.configuredChildBridge.set(nextBridge)
      const switches = this.smartAutomations().map(automation => ({ ...automation }))
      this.configuredChildBridgeSwitches.set(switches)
      this.configuredChildBridgeSwitchNames.set(switches.map(automation => automation.name).join(', '))
      this.fetchChildBridges()
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

  private generateBridgeUsername(): string {
    const random = new Uint8Array(5)
    globalThis.crypto.getRandomValues(random)
    const pairs = Array.from(random, value => value.toString(16).padStart(2, '0').toUpperCase())
    return `0E:${pairs.join(':')}`
  }

  private resetSmartAutomationDraft(): void {
    this.smartAutomationDraft = {
      type: 'smart-light-group',
      restoreAfterMs: 30000,
      uniqueIds: [],
      enabled: true,
    }
    this.selectedLightUniqueIds.set([])
  }

  private setAutomationSwitchState(id: string, enabled: boolean): void {
    this.automationSwitchStates.update((current) => {
      const next = { ...current }
      if (enabled) {
        next[id] = true
      } else {
        delete next[id]
      }
      return next
    })
  }

  private clearAutomationResetTimer(id: string): void {
    const timer = this.automationSwitchResetTimers.get(id)
    if (timer) {
      clearTimeout(timer)
      this.automationSwitchResetTimers.delete(id)
    }
  }

  private clearAutomationSwitchState(id: string): void {
    this.setAutomationSwitchState(id, false)
    this.clearAutomationResetTimer(id)
  }
}

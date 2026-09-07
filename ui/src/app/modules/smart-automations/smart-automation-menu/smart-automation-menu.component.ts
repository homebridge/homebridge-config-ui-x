import { ChangeDetectionStrategy, Component, createEnvironmentInjector, EnvironmentInjector, inject, input, model, output } from '@angular/core'
import { NgbDropdown, NgbDropdownItem, NgbDropdownMenu, NgbDropdownToggle } from '@ng-bootstrap/ng-bootstrap/dropdown'
import { NgbModal } from '@ng-bootstrap/ng-bootstrap/modal'
import { TranslatePipe } from '@ngx-translate/core'
import { firstValueFrom } from 'rxjs'

import { ApiService } from '@/app/core/communication/api.service'
import { WsService } from '@/app/core/communication/ws.service'
import { ConfirmComponent } from '@/app/core/components/confirm/confirm.component'
import { CONFIRM_MODAL_DATA, DISABLE_PLUGIN_MODAL_DATA, PLUGIN_LOGS_MODAL_DATA } from '@/app/core/modal-data-tokens'
import { DisablePluginComponent } from '@/app/core/plugins/disable-plugin/disable-plugin.component'
import { ChildBridge, Plugin } from '@/app/core/plugins/manage-plugins.interfaces'
import { ManagePluginsService } from '@/app/core/plugins/manage-plugins.service'
import { PluginLogsComponent } from '@/app/core/plugins/plugin-logs/plugin-logs.component'
import { SettingsService } from '@/app/core/ui/settings.service'
import { SMART_AUTOMATION_SETTINGS_DATA, SmartAutomationSettingsComponent } from '@/app/modules/smart-automations/smart-automation-settings/smart-automation-settings.component'

const SMART_AUTOMATION_PLUGIN = {
  name: 'homebridge-smart-automation',
  displayName: 'Smart Automation',
  installedVersion: '',
  isConfigured: true,
  links: {
    bugs: 'https://github.com/homebridge/homebridge-config-ui-x/issues',
  },
} as unknown as Plugin

@Component({
  selector: 'app-smart-automation-menu',
  imports: [NgbDropdown, NgbDropdownToggle, NgbDropdownMenu, NgbDropdownItem, TranslatePipe],
  standalone: true,
  templateUrl: './smart-automation-menu.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SmartAutomationMenuComponent {
  private injector = inject(EnvironmentInjector)
  private $api = inject(ApiService)
  private $modal = inject(NgbModal)
  private $plugins = inject(ManagePluginsService)
  private $settings = inject(SettingsService)
  private $ws = inject(WsService)

  public readonly bridgeUsername = input('')
  public readonly debugEnabled = input(false)
  public readonly disabled = model(false)
  public readonly debugChange = output<boolean>()

  public openSettings(): void {
    const injector = createEnvironmentInjector([{
      provide: SMART_AUTOMATION_SETTINGS_DATA,
      useValue: {
        debugEnabled: this.debugEnabled(),
        save: (enabled: boolean) => this.debugChange.emit(enabled),
      },
    }], this.injector)

    this.$modal.open(SmartAutomationSettingsComponent, {
      backdrop: 'static',
      injector,
    })
  }

  public viewLogs(): void {
    const injector = createEnvironmentInjector([{
      provide: PLUGIN_LOGS_MODAL_DATA,
      useValue: {
        plugin: SMART_AUTOMATION_PLUGIN,
        childBridges: this.childBridges(),
      },
    }], this.injector)

    this.$modal.open(PluginLogsComponent, {
      size: 'xl',
      backdrop: 'static',
      injector,
    })
  }

  public openJsonEditor(): void {
    void this.$plugins.jsonEditor(SMART_AUTOMATION_PLUGIN)
  }

  public async childBridgeAction(action: 'restart' | 'start' | 'stop'): Promise<void> {
    const username = this.bridgeUsername()
    if (!username) {
      return
    }
    try {
      const io = this.$ws.getExistingNamespace('child-bridges')
      await firstValueFrom(io.request(`${action}-child-bridge`, username))
    } catch (error) {
      console.error(error)
    }
  }

  public async disablePlugin(): Promise<void> {
    const injector = createEnvironmentInjector([{
      provide: DISABLE_PLUGIN_MODAL_DATA,
      useValue: {
        pluginName: SMART_AUTOMATION_PLUGIN.displayName,
        isConfigured: true,
        isConfiguredDynamicPlatform: true,
        keepOrphans: this.$settings.keepOrphans,
      },
    }], this.injector)
    const ref = this.$modal.open(DisablePluginComponent, {
      size: 'lg',
      backdrop: 'static',
      injector,
    })

    try {
      await ref.result
      await this.$api.put('/config-editor/plugin/homebridge-smart-automation/disable', {})
      await this.childBridgeAction('stop')
      this.disabled.set(true)
    } catch {
      // The confirmation was dismissed or the update failed.
    }
  }

  public async enablePlugin(): Promise<void> {
    const injector = createEnvironmentInjector([{
      provide: CONFIRM_MODAL_DATA,
      useValue: {
        title: SMART_AUTOMATION_PLUGIN.displayName,
        message: 'Enable the Smart Automation engine?',
        confirmButtonLabel: 'Enable',
        faIconClass: 'far fa-circle-play primary-text',
      },
    }], this.injector)
    const ref = this.$modal.open(ConfirmComponent, {
      size: 'lg',
      backdrop: 'static',
      injector,
    })

    try {
      await ref.result
      await this.$api.put('/config-editor/plugin/homebridge-smart-automation/enable', {})
      await this.childBridgeAction('start')
      this.disabled.set(false)
    } catch {
      // The confirmation was dismissed or the update failed.
    }
  }

  public resetAccessories(): void {
    void this.$plugins.resetChildBridges(this.childBridges())
  }

  private childBridges(): ChildBridge[] {
    const username = this.bridgeUsername()
    if (!username) {
      return []
    }
    return [{
      identifier: username,
      manuallyStopped: false,
      name: 'Smart Automation',
      paired: false,
      pid: 0,
      pin: '',
      plugin: SMART_AUTOMATION_PLUGIN.name,
      setupUri: '',
      status: 'unknown',
      username,
    }]
  }
}

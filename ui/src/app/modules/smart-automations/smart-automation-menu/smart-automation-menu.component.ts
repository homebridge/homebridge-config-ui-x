import { ChangeDetectionStrategy, Component, createEnvironmentInjector, EnvironmentInjector, inject, input, output } from '@angular/core'
import { NgbDropdown, NgbDropdownItem, NgbDropdownMenu, NgbDropdownToggle } from '@ng-bootstrap/ng-bootstrap/dropdown'
import { NgbModal } from '@ng-bootstrap/ng-bootstrap/modal'
import { TranslatePipe } from '@ngx-translate/core'
import { firstValueFrom } from 'rxjs'

import { WsService } from '@/app/core/communication/ws.service'
import { PLUGIN_LOGS_MODAL_DATA } from '@/app/core/modal-data-tokens'
import { ChildBridge, Plugin } from '@/app/core/plugins/manage-plugins.interfaces'
import { ManagePluginsService } from '@/app/core/plugins/manage-plugins.service'
import { PluginLogsComponent } from '@/app/core/plugins/plugin-logs/plugin-logs.component'
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
  private $modal = inject(NgbModal)
  private $plugins = inject(ManagePluginsService)
  private $ws = inject(WsService)

  public readonly bridgeUsername = input('')
  public readonly debugEnabled = input(false)
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

  public async childBridgeAction(action: 'restart' | 'stop'): Promise<void> {
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

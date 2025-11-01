import type { ChildBridge } from '@/app/core/manage-plugins/manage-plugins.interfaces'

import { inject, Injectable } from '@angular/core'
import { NgbModal } from '@ng-bootstrap/ng-bootstrap'
import { TranslateService } from '@ngx-translate/core'
import { ToastrService } from 'ngx-toastr'
import { firstValueFrom } from 'rxjs'

import { ApiService } from '@/app/core/api.service'
import { RestartChildBridgesComponent } from '@/app/core/components/restart-child-bridges/restart-child-bridges.component'
import { RestartHomebridgeComponent } from '@/app/core/components/restart-homebridge/restart-homebridge.component'

@Injectable({
  providedIn: 'root',
})
export class ChildBridgesService {
  private $api = inject(ApiService)
  private $modal = inject(NgbModal)
  private $toastr = inject(ToastrService)
  private $translate = inject(TranslateService)

  /**
   * Opens the correct restart modal based on whether the plugin has child bridges
   * @param pluginName - The name of the plugin to get child bridges for
   */
  public async openCorrectRestartModalForPlugin(pluginName: string) {
    const childBridges = await this.getChildBridgesForPlugin(pluginName)
    if (childBridges.length) {
      const ref = this.$modal.open(RestartChildBridgesComponent, {
        size: 'lg',
        backdrop: 'static',
      })
      ref.componentInstance.bridges = childBridges.map(childBridge => ({
        name: childBridge.name,
        username: childBridge.username,
        matterSerialNumber: childBridge.matterSerialNumber,
      }))
    } else {
      this.$modal.open(RestartHomebridgeComponent, {
        size: 'lg',
        backdrop: 'static',
      })
    }
  }

  /**
   * Gets child bridges for a specific plugin
   * @param pluginName - The name of the plugin to get child bridges for
   * @returns Array of child bridges for the plugin
   */
  private async getChildBridgesForPlugin(pluginName: string): Promise<ChildBridge[]> {
    try {
      const data: ChildBridge[] = await firstValueFrom(this.$api.get('/status/homebridge/child-bridges'))
      return data.filter(bridge => pluginName === bridge.plugin)
    } catch (error) {
      console.error(error)
      this.$toastr.error(error.message, this.$translate.instant('toast.title_error'))
      return []
    }
  }
}

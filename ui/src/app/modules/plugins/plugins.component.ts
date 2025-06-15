import { NgClass } from '@angular/common'
import { Component, inject, OnDestroy, OnInit } from '@angular/core'
import { FormControl, FormGroup, FormsModule, ReactiveFormsModule } from '@angular/forms'
import { NavigationEnd, Router } from '@angular/router'
import { NgbModal } from '@ng-bootstrap/ng-bootstrap'
import { TranslatePipe, TranslateService } from '@ngx-translate/core'
import { ToastrService } from 'ngx-toastr'
import { firstValueFrom, Subscription } from 'rxjs'

import { ApiService } from '@/app/core/api.service'
import { RestartHomebridgeComponent } from '@/app/core/components/restart-homebridge/restart-homebridge.component'
import { SpinnerComponent } from '@/app/core/components/spinner/spinner.component'
import { ManagePluginsService } from '@/app/core/manage-plugins/manage-plugins.service'
import { SettingsService } from '@/app/core/settings.service'
import { IoNamespace, WsService } from '@/app/core/ws.service'
import { PluginCardComponent } from '@/app/modules/plugins/plugin-card/plugin-card.component'

@Component({
  templateUrl: './plugins.component.html',
  styleUrls: ['./plugins.component.scss'],
  standalone: true,
  imports: [
    SpinnerComponent,
    FormsModule,
    ReactiveFormsModule,
    PluginCardComponent,
    TranslatePipe,
    NgClass,
  ],
})
export class PluginsComponent implements OnInit, OnDestroy {
  private $api = inject(ApiService)
  private $modal = inject(NgbModal)
  private $plugin = inject(ManagePluginsService)
  private $router = inject(Router)
  private $settings = inject(SettingsService)
  private $toastr = inject(ToastrService)
  private $translate = inject(TranslateService)
  private $ws = inject(WsService)
  private isSearchMode = false

  public mainError = false
  public loading = true
  public installedPlugins: any = []
  public childBridges = []
  public showExitButton = false
  public form = new FormGroup({
    query: new FormControl(''),
  })

  private io: IoNamespace
  private navigationSubscription: Subscription

  constructor() {}

  async ngOnInit() {
    this.io = this.$ws.connectToNamespace('child-bridges')
    this.io.connected.subscribe(async () => {
      this.getChildBridgeMetadata()
      this.io.socket.emit('monitor-child-bridge-status')

      // Load list of installed plugins
      await this.loadInstalledPlugins()

      // Get any query parameters
      const { action: queryAction, plugin: queryPlugin } = this.$router.parseUrl(this.$router.url).queryParams
      if (queryAction) {
        const plugin = this.installedPlugins.find(x => x.name === queryPlugin)
        switch (queryAction) {
          case 'just-installed': {
            if (plugin) {
              if (plugin.isConfigured) {
                this.$modal.open(RestartHomebridgeComponent, {
                  size: 'lg',
                  backdrop: 'static',
                })
              } else {
                this.$plugin.settings(plugin)
              }
            }
            break
          }
          case 'open-manage-version': {
            if (plugin) {
              this.$plugin.installAlternateVersion(plugin)
            }
            break
          }
        }

        // Clear the query parameters so that we don't keep showing the same action
        this.$router.navigate([], {
          queryParams: {},
          replaceUrl: true,
          queryParamsHandling: '',
        })
      }
    })

    this.io.socket.on('child-bridge-status-update', (data) => {
      const existingBridge = this.childBridges.find(x => x.username === data.username)
      if (existingBridge) {
        Object.assign(existingBridge, data)
      } else {
        this.childBridges.push(data)
      }
    })

    this.navigationSubscription = this.$router.events.subscribe((e: any) => {
      // If it is a NavigationEnd event re-initialise the component
      if (e instanceof NavigationEnd) {
        this.loadInstalledPlugins()
      }
    })
  }

  async loadInstalledPlugins() {
    this.form.setValue({ query: '' })
    this.showExitButton = false
    this.installedPlugins = []
    this.loading = true
    this.mainError = false

    try {
      const installedPlugins = await firstValueFrom(this.$api.get('/plugins'))
      this.installedPlugins = installedPlugins.filter((x: any) => x.name !== 'homebridge-config-ui-x')
      await this.appendMetaInfo()

      // The backend used to sort this only by plugins with updates first
      // I removed this sorting since now we want the frontend to do more of the work
      // We have more things that we want to bring to the top of the list
      const sortedList = this.installedPlugins.sort((a, b) => {
        // Priority 1: updateAvailable (true first, sorted alphabetically by 'name')
        if (a.updateAvailable !== b.updateAvailable) {
          return a.updateAvailable ? -1 : 1
        }

        // Priority 2: newHbScope (true first, sorted alphabetically by 'name')
        if (a.newHbScope && !b.newHbScope) {
          return -1
        }

        // Priority 3: disabled (false first, sorted alphabetically by 'name')
        if (a.disabled !== b.disabled) {
          return a.disabled ? 1 : -1
        }

        // Priority 4: isConfigured (false first, sorted alphabetically by 'name')
        if (a.isConfigured !== b.isConfigured) {
          return a.isConfigured ? 1 : -1
        }

        // Priority 5: hasChildBridgesUnpaired (true first, sorted alphabetically by 'name')
        if (a.hasChildBridgesUnpaired !== b.hasChildBridgesUnpaired) {
          return a.hasChildBridgesUnpaired ? -1 : 1
        }

        // Priority 6: hasChildBridges (false first, sorted alphabetically by 'name', only when recommendChildBridges is true)
        if (a.hasChildBridges !== b.hasChildBridges && this.$settings.env.recommendChildBridges) {
          return a.hasChildBridges ? 1 : -1
        }

        // If all criteria are equal, sort alphabetically by 'name'
        return a.name.localeCompare(b.name)
      })

      this.loading = false
      return sortedList
    } catch (error) {
      console.error(error)
      this.loading = false
      this.mainError = true
      this.$toastr.error(this.$translate.instant('plugins.toast_failed_to_load_plugins'), this.$translate.instant('toast.title_error'))
    }
  }

  async appendMetaInfo() {
    // Also get the current configuration for each plugin
    await Promise.all(this.installedPlugins
      .filter(plugin => plugin.installedVersion)
      .map(async (plugin: any) => {
        try {
          // Adds some extra properties to the plugin object for the plugin card
          const configBlocks = await firstValueFrom(this.$api.get(`/config-editor/plugin/${encodeURIComponent(plugin.name)}`))
          plugin.isConfigured = configBlocks.length > 0
          plugin.isConfiguredDynamicPlatform = plugin.isConfigured && Object.prototype.hasOwnProperty.call(configBlocks[0], 'platform')

          plugin.recommendChildBridge = plugin.isConfiguredDynamicPlatform
            && this.$settings.env.recommendChildBridges
            && this.$settings.env.serviceMode
            && !['homebridge', 'homebridge-config-ui-x'].includes(plugin.name)

          plugin.hasChildBridges = plugin.isConfigured && configBlocks.some(x => x._bridge && x._bridge.username)

          const pluginChildBridges = this.getPluginChildBridges(plugin)
          plugin.hasChildBridgesUnpaired = pluginChildBridges.some(x => !x.paired)

          if (this.$settings.env.plugins?.hideUpdatesFor?.includes(plugin.name)) {
            plugin.updateAvailable = false
          }
        } catch (err) {
          // May not be technically correct, but if we can't load the config, assume it is configured
          plugin.isConfigured = true
          plugin.hasChildBridges = true
        }
      }),
    )
  }

  search() {
    this.installedPlugins = []
    this.loading = true
    this.showExitButton = true

    this.$api.get(`/plugins/search/${encodeURIComponent(this.form.value.query)}`).subscribe({
      next: (data) => {
        // Some filtering in regard to the changeover to scoped plugins
        // A plugin may have two versions, like homebridge-foo and @homebridge-plugins/homebridge-foo
        // If the user does not have either installed, or has the scoped version installed, then hide the unscoped version
        // If the user has the unscoped version installed, but not the scoped version, then hide the scoped version
        const hiddenPlugins = new Set<string>()
        this.installedPlugins = data
          .reduce((acc: any, x: any) => {
            if (x.name === 'homebridge-config-ui-x' || hiddenPlugins.has(x.name)) {
              return acc
            }
            if (x.newHbScope) {
              const y = x.newHbScope.to
              const yExists = data.some((plugin: any) => plugin.name === y)
              if (x.installedVersion || !yExists) {
                hiddenPlugins.add(y)
                acc.push(x)
              }
            } else {
              acc.push(x)
            }
            return acc
          }, [])
        this.appendMetaInfo()
        this.loading = false
      },
      error: (error) => {
        this.loading = false
        this.isSearchMode = false
        console.error(error)
        this.$toastr.error(error.error.message || error.message, this.$translate.instant('toast.title_error'))
        this.loadInstalledPlugins()
      },
    })
  }

  onClearSearch() {
    this.loadInstalledPlugins()
  }

  onSubmit({ value }) {
    if (!value.query.length) {
      if (this.isSearchMode) {
        this.isSearchMode = false
        this.loadInstalledPlugins()
      }
    } else {
      this.isSearchMode = true
      this.search()
    }
  }

  getChildBridgeMetadata() {
    this.io.request('get-homebridge-child-bridge-status').subscribe((data) => {
      this.childBridges = data
    })
  }

  getPluginChildBridges(plugin: any) {
    return this.childBridges.filter(x => x.plugin === plugin.name)
  }

  ngOnDestroy() {
    if (this.navigationSubscription) {
      this.navigationSubscription.unsubscribe()
    }
    this.io.end()
  }
}

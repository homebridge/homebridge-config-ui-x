import { CommonModule } from '@angular/common'
import { Component, inject, OnDestroy, OnInit, TemplateRef, viewChild } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { NgbModal } from '@ng-bootstrap/ng-bootstrap'
import { ToastrService } from 'ngx-toastr'

import { ApiService } from '@/app/core/communication/api.service'

@Component({
  selector: 'app-direct-connection',
  imports: [CommonModule, FormsModule],
  standalone: true,
  templateUrl: './direct-connection.component.html',
  styleUrl: './direct-connection.component.scss',
})
export class DirectConnectionComponent implements OnInit, OnDestroy {
  public loginUrl: string | null = null
  private loginPollInterval: any = null
  private $api = inject(ApiService)
  private $toastr = inject(ToastrService)
  private modalService = inject(NgbModal)

  public config: any = {
    enabled: false,
    externalUrl: '',
    connectionMethod: 'cloudflare',
    cloudflareVariant: 'named-tunnel-oauth',
    hostname: '',
    tunnelId: '',
    isLoggedIn: false,
  }

  ngOnInit(): void {
    void this.loadConfig()
  }

  ngOnDestroy(): void {
    if (this.loginPollInterval) {
      clearInterval(this.loginPollInterval)
    }
  }

  async loadConfig() {
    try {
      const data = await this.$api.get<any>('/settings/direct-connection')
      this.config = {
        ...this.config,
        ...data,
      }
      if (!this.config.hostname) {
        this.config.hostname = 'homebridge-dev.beckersmarthome.com'
      }
    } catch (error) {
      this.$toastr.error('Failed to load Direct Connection settings.')
    }
  }

  async saveConfig() {
    try {
      const res = await this.$api.post<any>('/settings/direct-connection', this.config)
      this.config = {
        ...this.config,
        ...res,
      }
      this.$toastr.success('Settings saved.')
    } catch (error) {
      this.$toastr.error('Failed to save settings.')
    }
  }

  async connectTunnel() {
    this.$toastr.info('Connecting tunnel...')
    this.config.enabled = true
    await this.saveConfig()
  }

  async testConnection() {
    try {
      const res = await this.$api.post<any>('/settings/direct-connection/test', {})
      if (res.success) {
        this.$toastr.success(res.message)
      } else {
        this.$toastr.warning(res.message)
      }
    } catch (error) {
      this.$toastr.error('Error testing connection.')
    }
  }

  disconnect() {
    this.config.tunnelId = ''
    this.config.hostname = ''
    void this.saveConfig()
  }

  async logout() {
    try {
      await this.$api.post<any>('/settings/direct-connection/logout', {})
      this.config.tunnelId = ''
      this.config.hostname = ''
      this.config.isLoggedIn = false
      this.$toastr.success('Successfully logged out of Cloudflare.')
      await this.loadConfig()
    } catch (error) {
      this.$toastr.error('Failed to logout.')
    }
  }

  async loginWithCloudflare() {
    this.$toastr.info('Initiating Cloudflare login...')
    this.loginUrl = null
    try {
      const res = await this.$api.get<any>('/settings/direct-connection/login')
      if (res.url) {
        this.loginUrl = res.url
        window.open(res.url, '_blank')
        this.startLoginPolling()
      } else if (res.message) {
        this.$toastr.info(res.message)
        await this.loadConfig()
      }
    } catch (error: any) {
      this.$toastr.error(error?.error?.message || 'Failed to initiate login.')
    }
  }

  startLoginPolling() {
    if (this.loginPollInterval) {
      clearInterval(this.loginPollInterval)
    }

    // Direct GET call to poll login status without saving/triggering tunnel run
    this.loginPollInterval = setInterval(async () => {
      try {
        const data = await this.$api.get<any>('/settings/direct-connection')
        if (data.isLoggedIn) {
          clearInterval(this.loginPollInterval)
          this.loginPollInterval = null
          this.loginUrl = null
          this.config.isLoggedIn = true
          this.$toastr.success('Cloudflare authentication successful!')
          await this.loadConfig()
        }
      } catch (e) {
        // Ignore temporary network errors during polling
      }
    }, 3000)
  }

  readonly directConnectionModal = viewChild.required<TemplateRef<any>>('directConnectionModal')

  openDirectConnectionModal() {
    void this.loadConfig()
    this.modalService.open(this.directConnectionModal(), { size: 'lg', centered: true })
  }
}

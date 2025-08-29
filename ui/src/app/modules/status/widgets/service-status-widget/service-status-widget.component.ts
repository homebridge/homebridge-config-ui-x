import { NgIf } from '@angular/common'
import { Component, inject, Input, OnInit } from '@angular/core'
import { TranslatePipe } from '@ngx-translate/core'

import { ApiService } from '@/app/core/api.service'
import { Widget } from '@/app/modules/status/widgets/widgets.interfaces'

interface ServiceStatus {
  isRunningAsService: boolean
  platform: string
  serviceName?: string
  recommendations?: string[]
}

@Component({
  templateUrl: './service-status-widget.component.html',
  styleUrls: ['./service-status-widget.component.scss'],
  standalone: true,
  imports: [
    NgIf,
    TranslatePipe,
  ],
})
export class ServiceStatusWidgetComponent implements OnInit {
  private $api = inject(ApiService)

  @Input() widget: Widget

  public serviceStatus: ServiceStatus = {
    isRunningAsService: false,
    platform: 'unknown',
    recommendations: [],
  }

  public loading = true
  public showRecommendations = false

  public ngOnInit() {
    this.loadServiceStatus()
  }

  private async loadServiceStatus() {
    try {
      this.serviceStatus = await this.$api.get('/status/service').toPromise()
      this.loading = false
      
      // Show recommendations if not running as service and has recommendations
      this.showRecommendations = !this.serviceStatus.isRunningAsService && 
                                 this.serviceStatus.recommendations && 
                                 this.serviceStatus.recommendations.length > 0
    } catch (error) {
      console.error('Failed to load service status:', error)
      this.loading = false
    }
  }

  public getPlatformDisplayName(): string {
    switch (this.serviceStatus.platform) {
      case 'darwin':
        return 'macOS'
      case 'linux':
        return 'Linux'
      case 'win32':
        return 'Windows'
      default:
        return this.serviceStatus.platform
    }
  }

  public getStatusIcon(): string {
    if (this.loading) {
      return 'fas fa-spinner fa-spin'
    }
    return this.serviceStatus.isRunningAsService ? 'fas fa-check-circle text-success' : 'fas fa-exclamation-triangle text-warning'
  }

  public getStatusText(): string {
    if (this.loading) {
      return 'Checking...'
    }
    return this.serviceStatus.isRunningAsService ? 'Service Active' : 'Service Not Detected'
  }
}
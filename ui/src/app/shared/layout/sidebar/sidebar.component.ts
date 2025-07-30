import { NgClass, NgOptimizedImage } from '@angular/common'
import { Component, inject, Input, OnDestroy, OnInit, Renderer2 } from '@angular/core'
import { NavigationEnd, Router, RouterLink, RouterLinkActive } from '@angular/router'
import { NgbModal } from '@ng-bootstrap/ng-bootstrap'
import { TranslatePipe, TranslateService } from '@ngx-translate/core'
import { isStandalonePWA } from 'is-standalone-pwa'

import { AuthService } from '@/app/core/auth/auth.service'
import { InformationComponent } from '@/app/core/components/information/information.component'
import { NotificationService } from '@/app/core/notification.service'
import { SettingsService } from '@/app/core/settings.service'

@Component({
  selector: 'app-sidebar',
  templateUrl: './sidebar.component.html',
  styleUrls: ['./sidebar.component.scss'],
  standalone: true,
  imports: [
    RouterLink,
    NgOptimizedImage,
    NgClass,
    RouterLinkActive,
    TranslatePipe,
  ],
})
export class SidebarComponent implements OnInit, OnDestroy {
  private $auth = inject(AuthService)
  private $settings = inject(SettingsService)
  private $modal = inject(NgbModal)
  private $notification = inject(NotificationService)
  private $renderer = inject(Renderer2)
  private $router = inject(Router)
  private $translate = inject(TranslateService)

  @Input() isExpanded = false

  public formAuth = this.$settings.formAuth
  public isAdmin = this.$auth.user.admin
  public enableTerminalAccess = this.$settings.env.enableTerminalAccess
  public rPiCurrentlyUnderVoltage = false
  public rPiWasUnderVoltage = false
  public isMobile: any = false
  public freezeMenu = false
  public isPwa = isStandalonePWA()

  constructor() {
    this.isMobile = window.innerWidth < 768
    let resizeTimeout: any
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimeout)
      resizeTimeout = setTimeout(() => {
        this.updateListeners()
      }, 500)
    })

    // Ensure the menu closes when we navigate
    this.$router.events.subscribe((event) => {
      if (event instanceof NavigationEnd) {
        this.closeSidebar()
        this.freezeMenu = true
        setTimeout(() => {
          this.freezeMenu = false
        }, 750)
      }
    })
  }

  public ngOnInit() {
    this.$notification.raspberryPiThrottled.subscribe((throttled) => {
      if (throttled['Under Voltage']) {
        this.rPiCurrentlyUnderVoltage = true
      }
      if (throttled['Under-voltage has occurred']) {
        this.rPiWasUnderVoltage = true
      }
    })

    this.$notification.formAuthEnabled.subscribe((value) => {
      this.formAuth = value
    })

    // Declare element for event listeners
    const sidebar = document.querySelector('.sidebar')
    const mobileHeader = document.querySelector('.m-header')
    const content = document.querySelector('.content')

    if (this.isMobile) {
      document.addEventListener('touchstart', (e: MouseEvent) => {
        if (content.contains(e.target as HTMLElement) && this.isExpanded) {
          e.preventDefault()
          this.toggleSidebar()
          return
        }

        if (!sidebar.contains(e.target as HTMLElement) && !mobileHeader.contains(e.target as HTMLElement) && this.isExpanded) {
          e.preventDefault()
          this.closeSidebar()
        }
      }, { passive: false })
    } else {
      this.updateListeners()

      mobileHeader.addEventListener('mouseenter', () => this.openSidebar(), { passive: false })
      mobileHeader.addEventListener('mouseleave', () => this.closeSidebar(), { passive: false })

      document.addEventListener('click', (e: MouseEvent) => {
        if (sidebar.contains(e.target as HTMLElement) && e.clientX > 60) {
          this.closeSidebar()
        }
      }, { passive: false })
    }

    this.updateContentStyles()
  }

  public toggleSidebar() {
    if (!this.freezeMenu) {
      this.isExpanded = !this.isExpanded
      this.updateContentStyles()
    }
  }

  public openUnderVoltageModal() {
    const ref = this.$modal.open(InformationComponent, {
      size: 'lg',
      backdrop: 'static',
    })

    ref.componentInstance.title = this.$translate.instant('rpi.throttled.undervoltage_title')
    ref.componentInstance.message = this.$translate.instant(this.rPiCurrentlyUnderVoltage
      ? 'rpi.throttled.currently_message'
      : 'rpi.throttled.previously_message',
    )
    ref.componentInstance.ctaButtonLabel = this.$translate.instant('form.button_more_info')
    ref.componentInstance.faIconClass = 'fas fa-fw fa-bolt yellow-text'
    ref.componentInstance.ctaButtonLink = 'https://pimylifeup.com/raspberry-pi-low-voltage-warning'
  }

  public handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Enter') {
      const target = event.target as HTMLElement
      if (['menuitem', 'button'].includes(target.getAttribute('role'))) {
        target.click()
      }
    }
  }

  public reloadPage() {
    window.location.reload()
  }

  public ngOnDestroy() {
    // Clean up event listeners
    document.removeEventListener('touchstart', () => {})
    document.removeEventListener('click', () => {})
  }

  public logout() {
    this.$auth.logout()
  }

  private openSidebar() {
    if (!this.freezeMenu) {
      this.isExpanded = true
      this.updateContentStyles()
    }
  }

  private closeSidebar() {
    if (!this.freezeMenu) {
      this.isExpanded = false
      this.updateContentStyles()
    }
  }

  private updateContentStyles() {
    const content = document.querySelector('.content')
    if (this.isExpanded) {
      this.$renderer.setStyle(content, 'opacity', '20%')
      this.$renderer.setStyle(content, 'pointer-events', 'none')
      this.$renderer.setStyle(content, 'overflow', 'hidden')
    } else {
      this.$renderer.removeStyle(content, 'opacity')
      this.$renderer.removeStyle(content, 'pointer-events')
      this.$renderer.removeStyle(content, 'overflow')
    }
  }

  private updateListeners() {
    this.isMobile = window.innerWidth < 768
    const sidebar = document.querySelector('.sidebar')
    sidebar.removeAllListeners()
    if (this.isMobile || (!this.isMobile && this.$settings.menuMode !== 'freeze')) {
      sidebar.addEventListener('mouseenter', () => this.openSidebar(), { passive: false })
      sidebar.addEventListener('mouseleave', () => this.closeSidebar(), { passive: false })
    }
  }
}

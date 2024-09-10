import { AuthService } from '@/app/core/auth/auth.service'
import { InformationComponent } from '@/app/core/components/information/information.component'
import { MobileDetectService } from '@/app/core/mobile-detect.service'
import { NotificationService } from '@/app/core/notification.service'
import { SettingsService } from '@/app/core/settings.service'
import {
  Component,
  Input,
  OnInit,
  Renderer2,
} from '@angular/core'
import { NavigationEnd, Router } from '@angular/router'
import { NgbModal } from '@ng-bootstrap/ng-bootstrap'
import { TranslateService } from '@ngx-translate/core'

@Component({
  selector: 'app-sidebar',
  templateUrl: './sidebar.component.html',
  styleUrls: ['./sidebar.component.scss'],
})
export class SidebarComponent implements OnInit {
  @Input() isExpanded = false

  public rPiCurrentlyUnderVoltage = false
  public rPiWasUnderVoltage = false
  public isMobile: any = false
  public freezeMenu = false

  constructor(
    public router: Router,
    public translate: TranslateService,
    public $auth: AuthService,
    public $settings: SettingsService,
    private $md: MobileDetectService,
    private $modal: NgbModal,
    private $notification: NotificationService,
    private $translate: TranslateService,
    private renderer: Renderer2,
  ) {
    this.isMobile = this.$md.detect.mobile()

    // ensure the menu closes when we navigate
    router.events.subscribe((event) => {
      if (event instanceof NavigationEnd) {
        this.closeSidebar()
        this.freezeMenu = true
        setTimeout(() => {
          this.freezeMenu = false
        }, 500)
      }
    })
  }

  ngOnInit() {
    this.$notification.raspberryPiThrottled.subscribe((throttled) => {
      if (throttled['Under Voltage']) {
        this.rPiCurrentlyUnderVoltage = true
      }
      if (throttled['Under-voltage has occurred']) {
        this.rPiWasUnderVoltage = true
      }
    })

    // declare element for event listeners
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
      // Expand sidebar on mouseenter
      sidebar.addEventListener('mouseenter', () => this.openSidebar(), { passive: false })
      mobileHeader.addEventListener('mouseenter', () => this.openSidebar(), { passive: false })

      // Collapse sidebar on mouseleave
      sidebar.addEventListener('mouseleave', () => this.closeSidebar(), { passive: false })
      mobileHeader.addEventListener('mouseleave', () => this.closeSidebar(), { passive: false })

      document.addEventListener('click', (e: MouseEvent) => {
        if (sidebar.contains(e.target as HTMLElement) && e.clientX > 60) {
          this.closeSidebar()
        }
      }, { passive: false })
    }

    this.updateContentStyles()
  }

  openSidebar() {
    if (!this.freezeMenu) {
      this.isExpanded = true
      this.updateContentStyles()
    }
  }

  closeSidebar() {
    if (!this.freezeMenu) {
      this.isExpanded = false
      this.updateContentStyles()
    }
  }

  toggleSidebar() {
    if (!this.freezeMenu) {
      this.isExpanded = !this.isExpanded
      this.updateContentStyles()
    }
  }

  updateContentStyles() {
    const content = document.querySelector('.content')
    if (this.isExpanded) {
      this.renderer.setStyle(content, 'opacity', '20%')
      this.renderer.setStyle(content, 'pointer-events', 'none')
      this.renderer.setStyle(content, 'overflow', 'hidden')
    } else {
      this.renderer.removeStyle(content, 'opacity')
      this.renderer.removeStyle(content, 'pointer-events')
      this.renderer.removeStyle(content, 'overflow')
    }
  }

  openUnderVoltageModal() {
    const ref = this.$modal.open(InformationComponent, {
      size: 'lg',
      backdrop: 'static',
    })

    ref.componentInstance.title = this.$translate.instant('rpi.throttled.undervoltage_title')
    ref.componentInstance.message = this.$translate.instant(this.rPiCurrentlyUnderVoltage
      ? 'rpi.throttled.currently_undervoltage_message'
      : 'rpi.throttled.previously_undervoltage_message',
    )
    ref.componentInstance.ctaButtonLabel = this.$translate.instant('form.button_more_info')
    ref.componentInstance.faIconClass = 'fas fa-fw fa-bolt yellow-text'
    ref.componentInstance.ctaButtonLink = 'https://pimylifeup.com/raspberry-pi-low-voltage-warning'
  }

  handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Enter') {
      const target = event.target as HTMLElement
      if (['menuitem', 'button'].includes(target.getAttribute('role'))) {
        target.click()
      }
    }
  }
}

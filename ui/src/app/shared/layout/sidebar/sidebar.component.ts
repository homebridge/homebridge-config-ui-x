import { Component, Input, OnInit } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { TranslateService } from '@ngx-translate/core';
import { AuthService } from '@/app/core/auth/auth.service';
import { InformationComponent } from '@/app/core/components/information/information.component';
import { MobileDetectService } from '@/app/core/mobile-detect.service';
import { NotificationService } from '@/app/core/notification.service';
import { SettingsService } from '@/app/core/settings.service';

@Component({
  selector: 'app-sidebar',
  templateUrl: './sidebar.component.html',
  styleUrls: ['./sidebar.component.scss'],
})
export class SidebarComponent implements OnInit {
  @Input() isExpanded = false;

  public rPiCurrentlyUnderVoltage = false;
  public rPiWasUnderVoltage = false;
  public isMobile: any = false;
  public freezeMenu = false;

  constructor(
    public router: Router,
    public translate: TranslateService,
    public $auth: AuthService,
    public $settings: SettingsService,
    private $md: MobileDetectService,
    private $modal: NgbModal,
    private $notification: NotificationService,
    private $translate: TranslateService,
  ) {
    this.isMobile = this.$md.detect.mobile();

    // ensure the menu closes when we navigate
    router.events.subscribe((event) => {
      if (event instanceof NavigationEnd) {
        this.closeSideBar();
        this.freezeMenu = true;
        setTimeout(() => {
          this.freezeMenu = false;
        }, 500);
      }
    });
  }

  ngOnInit() {
    this.$notification.raspberryPiThrottled.subscribe((throttled) => {
      if (throttled['Under Voltage']) {
        this.rPiCurrentlyUnderVoltage = true;
      }
      if (throttled['Under-voltage has occurred']) {
        this.rPiWasUnderVoltage = true;
      }
    });

    // declare element for event listeners
    const sidebar = document.querySelector('.sidebar');
    const mobileHeader = document.querySelector('.m-header');

    if (!this.isMobile) {
      // Expand sidebar on mouseenter
      sidebar.addEventListener('mouseenter', (e: MouseEvent) => this.openSidebar());
      mobileHeader.addEventListener('mouseenter', (e: MouseEvent) => this.openSidebar());

      // Collapse sidebar on mouseleave
      sidebar.addEventListener('mouseleave', (e: MouseEvent) => this.closeSideBar());
      mobileHeader.addEventListener('mouseleave', (e: MouseEvent) => this.closeSideBar());

      document.addEventListener('click', (e: MouseEvent) => {
        if (sidebar.contains(e.target as HTMLElement) && e.clientX > 60) {
          this.closeSideBar();
        }
      });
    }
  }

  openSidebar() {
    if (!this.isExpanded && !this.freezeMenu) {
      this.isExpanded = true;
    }
  }

  closeSideBar() {
    if (this.isExpanded && !this.freezeMenu) {
      this.isExpanded = false;
    }
  }

  toggleSidebar() {
    if (!this.freezeMenu) {
      this.isExpanded = !this.isExpanded;
    }
  }

  openUnderVoltageModal() {
    const ref = this.$modal.open(InformationComponent, {
      size: 'lg',
      backdrop: 'static',
    });

    ref.componentInstance.title = this.$translate.instant('rpi.throttled.undervoltage_title');
    ref.componentInstance.message = this.$translate.instant(this.rPiCurrentlyUnderVoltage
      ? 'rpi.throttled.currently_undervoltage_message'
      : 'rpi.throttled.previously_undervoltage_message',
    );
    ref.componentInstance.ctaButtonLabel = this.$translate.instant('form.button_more_info');
    ref.componentInstance.faIconClass = 'fas fa-fw fa-bolt yellow-text';
    ref.componentInstance.ctaButtonLink = 'https://pimylifeup.com/raspberry-pi-low-voltage-warning';
  }

  handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Enter') {
      const target = event.target as HTMLElement;
      if (['menuitem', 'button'].includes(target.getAttribute('role'))) {
        target.click();
      }
    }
  }
}

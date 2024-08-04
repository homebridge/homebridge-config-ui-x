import {
  Component,
  EventEmitter,
  Input,
  OnInit,
  Output,
} from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { TranslateService } from '@ngx-translate/core';
import { AuthService } from '@/app/core/auth/auth.service';
import { InformationComponent } from '@/app/core/components/information/information.component';
import { NotificationService } from '@/app/core/notification.service';
import { SettingsService } from '@/app/core/settings.service';

@Component({
  selector: 'app-sidebar',
  templateUrl: './sidebar.component.html',
  styleUrls: ['./sidebar.component.scss'],
})
export class SidebarComponent implements OnInit {
  @Input() isExpanded = false;
  @Output() toggleSidebar: EventEmitter<boolean> = new EventEmitter<boolean>();

  public rPiCurrentlyUnderVoltage = false;
  public rPiWasUnderVoltage = false;

  constructor(
    public router: Router,
    public translate: TranslateService,
    public $auth: AuthService,
    public $settings: SettingsService,
    private $modal: NgbModal,
    private $notification: NotificationService,
    private $translate: TranslateService,
  ) {
    // ensure the menu closes when we navigate
    router.events.subscribe((event) => {
      if (event instanceof NavigationEnd) {
        if (this.isExpanded) {
          this.toggleSidebar.emit(false);
        }
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
    const sidebarLink = document.querySelector('.sidebar.link');
    const content = document.querySelector('.content');

    // expand sidebar on mouseenter
    sidebar.addEventListener('mouseenter', (e: Event) => {
      sidebar.classList.add('expanded');
      content.classList.add('sidebarExpanded');
    });

    // collapse sidebar on mouseleave
    sidebar.addEventListener('mouseleave', (e: Event) => {
      sidebar.classList.remove('expanded');
      content.classList.remove('sidebarExpanded');
    });

    // collapse sidebar when click outside (mobile)
    const touchEvent = 'ontouchstart' in window ? 'touchstart' : 'click';

    document.addEventListener(touchEvent, (e: Event) => {
      if (!sidebar.contains(e.target as HTMLElement) || sidebarLink.contains(e.target as HTMLElement)) {
        sidebar.classList.remove('expanded');
        content.classList.remove('sidebarExpanded');
      }
    });
  }

  handleSidebarToggle() {
    this.toggleSidebar.emit(!this.isExpanded);
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

import {
  Component,
  EventEmitter,
  Input,
  Output,
} from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { TranslateService } from '@ngx-translate/core';
import { AuthService } from '@/app/core/auth/auth.service';
import { SettingsService } from '@/app/core/settings.service';
import { PowerOptionsComponent } from '@/app/shared/layout/power-options/power-options.component';

@Component({
  selector: 'app-sidebar',
  templateUrl: './sidebar.component.html',
  styleUrls: ['./sidebar.component.scss'],
})
export class SidebarComponent {
  @Input() isExpanded = false;
  @Output() toggleSidebar: EventEmitter<boolean> = new EventEmitter<boolean>();

  constructor(
    public router: Router,
    public translate: TranslateService,
    public $auth: AuthService,
    public $settings: SettingsService,
    private $modal: NgbModal,
  ) {
    // ensure the menu closes when we navigate
    router.events.subscribe((event) => {
      if (event instanceof NavigationEnd) {
        if (this.isExpanded) {
          this.toggleSidebar.emit(!this.isExpanded);
        }
      }
    });
  }

  handleSidebarToggle() {
    this.toggleSidebar.emit(!this.isExpanded);
  }

  openRestartModal() {
    this.$modal.open(PowerOptionsComponent);
  }
}

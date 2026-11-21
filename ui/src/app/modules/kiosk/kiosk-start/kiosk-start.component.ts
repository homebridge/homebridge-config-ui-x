import type { KioskScope } from '@/app/modules/kiosk/kiosk-scope'

import { ChangeDetectionStrategy, Component, computed, inject, OnInit, signal } from '@angular/core'
import { Router } from '@angular/router'
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap/modal'
import { TranslatePipe, TranslateService } from '@ngx-translate/core'
import { ToastrService } from 'ngx-toastr'

import { AccessoriesService } from '@/app/core/accessories/accessories.service'
import { KioskDevicesService } from '@/app/modules/kiosk/kiosk-devices.service'
import { EMPTY_KIOSK_SCOPE, kioskPath, scopeToQuery } from '@/app/modules/kiosk/kiosk-scope'
import { ScopePickerComponent } from '@/app/modules/kiosk/scope-picker/scope-picker.component'

/** Start kiosk mode in this browser for a scope of rooms, categories, subcategories and labels, or copy its link */
@Component({
  selector: 'app-kiosk-start',
  imports: [
    ScopePickerComponent,
    TranslatePipe,
  ],
  standalone: true,
  templateUrl: './kiosk-start.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class KioskStartComponent implements OnInit {
  private $activeModal = inject(NgbActiveModal)
  private $accessories = inject(AccessoriesService)
  private $devices = inject(KioskDevicesService)
  private $router = inject(Router)
  private $toastr = inject(ToastrService)
  private $translate = inject(TranslateService)

  /** Set by the opener: the scope to start with, e.g. the accessories page filter */
  public preselectScope?: KioskScope

  protected readonly scope = signal<KioskScope>({ ...EMPTY_KIOSK_SCOPE })
  protected readonly rooms = computed(() => this.$accessories.rooms().map(room => room.name))
  protected readonly labels = computed(() => [
    ...new Set(Object.values(this.$accessories.labels()).flat()),
  ].sort((a, b) => a.localeCompare(b)))

  /** How many accessories the scope holds right now */
  protected readonly count = computed(() => this.$devices.resolveAllowed(this.scope()).length)

  public ngOnInit(): void {
    const start = this.preselectScope ?? EMPTY_KIOSK_SCOPE
    this.scope.set({
      rooms: [...start.rooms],
      categories: [...start.categories],
      subcategories: [...start.subcategories],
      labels: [...start.labels],
    })
  }

  /** Open the kiosk in this browser with the scope */
  protected start(): void {
    void this.$router.navigate(['/kiosk'], {
      queryParams: scopeToQuery(this.scope()),
    })
    this.$activeModal.close()
  }

  /** Copy the kiosk link for the scope to the clipboard and say so in a toast */
  protected async copyLink(): Promise<void> {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}${kioskPath(this.scope())}`)
      this.$toastr.success(this.$translate.instant('kiosk.link_copied'), this.$translate.instant('toast.title_success'))
    } catch {
      this.$toastr.error(this.$translate.instant('kiosk.link_failed'), this.$translate.instant('toast.title_error'))
    }
  }

  protected dismiss(): void {
    this.$activeModal.dismiss()
  }
}

import { inject, Injectable } from '@angular/core'
import { Router } from '@angular/router'
import { TranslateService } from '@ngx-translate/core'
import { ToastrService } from 'ngx-toastr'

import { KioskScope, scopeToQuery, scopeToSearchParams } from '@/app/modules/kiosk/kiosk-scope'

/** Opens and copies the kiosk link for a scope of rooms, categories, subcategories and labels */
@Injectable({
  providedIn: 'root',
})
export class KioskLinksService {
  private $router = inject(Router)
  private $toastr = inject(ToastrService)
  private $translate = inject(TranslateService)

  /** The in-app path of a scope's kiosk page, with the scope as repeated query params */
  public path(scope: KioskScope): string {
    const query = scopeToSearchParams(scope).toString()
    return query
      ? `/kiosk?${query}`
      : '/kiosk'
  }

  /** The full link to a scope's kiosk page, for copying */
  public url(scope: KioskScope): string {
    return `${window.location.origin}${this.path(scope)}`
  }

  /** Open the kiosk in this tab */
  public open(scope: KioskScope): Promise<boolean> {
    return this.$router.navigate(['/kiosk'], {
      queryParams: scopeToQuery(scope),
    })
  }

  /** Copy the kiosk link to the clipboard and say so in a toast */
  public async copy(scope: KioskScope): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.url(scope))
      this.$toastr.success(this.$translate.instant('kiosk.link_copied'), this.$translate.instant('toast.title_success'))
    } catch {
      this.$toastr.error(this.$translate.instant('kiosk.link_failed'), this.$translate.instant('toast.title_error'))
    }
  }
}

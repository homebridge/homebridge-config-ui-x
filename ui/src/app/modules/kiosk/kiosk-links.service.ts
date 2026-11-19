import { inject, Injectable } from '@angular/core'
import { Router } from '@angular/router'
import { TranslateService } from '@ngx-translate/core'
import { ToastrService } from 'ngx-toastr'

/** Opens and copies the kiosk link for a view, built-in or saved */
@Injectable({
  providedIn: 'root',
})
export class KioskLinksService {
  private $router = inject(Router)
  private $toastr = inject(ToastrService)
  private $translate = inject(TranslateService)

  /** The in-app path of a view's kiosk page */
  public path(viewId: string): string {
    return `/kiosk/${encodeURIComponent(viewId)}`
  }

  /** The full link to a view's kiosk page, for copying */
  public url(viewId: string): string {
    return `${window.location.origin}${this.$router.serializeUrl(this.$router.createUrlTree(['/kiosk', viewId]))}`
  }

  /** Open the kiosk in this tab */
  public open(viewId: string): Promise<boolean> {
    return this.$router.navigateByUrl(this.path(viewId))
  }

  /** Copy the kiosk link to the clipboard and say so in a toast */
  public async copy(viewId: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.url(viewId))
      this.$toastr.success(this.$translate.instant('kiosk.link_copied'), this.$translate.instant('toast.title_success'))
    } catch {
      this.$toastr.error(this.$translate.instant('kiosk.link_failed'), this.$translate.instant('toast.title_error'))
    }
  }
}

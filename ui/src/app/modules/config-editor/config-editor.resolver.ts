import { inject } from '@angular/core'
import { ResolveFn, Router } from '@angular/router'
import { TranslateService } from '@ngx-translate/core'
import { ToastrService } from 'ngx-toastr'

import { ApiService } from '@/app/core/communication/api.service'

export const configEditorResolver: ResolveFn<string | undefined> = async () => {
  const $api = inject(ApiService)
  const $router = inject(Router)
  const $toastr = inject(ToastrService)
  const $translate = inject(TranslateService)

  try {
    const json = await $api.get('/config-editor')
    return JSON.stringify(json, null, 4)
  } catch (error: any) {
    console.error(error)
    $toastr.error(error.message, $translate.instant('toast.title_error'))
    // Returning undefined does not cancel route activation in Angular —
    // the component still mounts and then throws on the missing payload.
    // Redirect and then re-throw so the editor never tries to parse it.
    await $router.navigate(['/'])
    throw error
  }
}

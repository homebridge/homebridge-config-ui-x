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
  } catch (error) {
    console.error(error)
    $toastr.error(error.message, $translate.instant('toast.title_error'))
    void $router.navigate(['/'])
    return undefined
  }
}

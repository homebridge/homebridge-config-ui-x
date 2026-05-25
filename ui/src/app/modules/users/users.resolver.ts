import { inject } from '@angular/core'
import { ResolveFn, Router } from '@angular/router'
import { TranslateService } from '@ngx-translate/core'
import { ToastrService } from 'ngx-toastr'

import { ApiService } from '@/app/core/communication/api.service'

export const usersResolver: ResolveFn<any> = async () => {
  const $api = inject(ApiService)
  const $router = inject(Router)
  const $toastr = inject(ToastrService)
  const $translate = inject(TranslateService)

  try {
    return await $api.get('/users')
  } catch (error: any) {
    console.error(error)
    $toastr.error(error.message, $translate.instant('toast.title_error'))
    await $router.navigate(['/'])
    throw error
  }
}

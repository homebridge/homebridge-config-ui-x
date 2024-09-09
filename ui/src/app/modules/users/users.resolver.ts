import { ApiService } from '@/app/core/api.service'
import { Injectable } from '@angular/core'
import { Resolve, Router } from '@angular/router'
import { ToastrService } from 'ngx-toastr'

@Injectable()
export class UsersResolver implements Resolve<any> {
  constructor(
    private $api: ApiService,
    private $toastr: ToastrService,
    private $router: Router,
  ) {}

  async resolve() {
    try {
      return await this.$api.get('/users').toPromise()
    } catch (err) {
      this.$toastr.error(err.message, 'Failed to Load Users')
      this.$router.navigate(['/'])
    }
  }
}

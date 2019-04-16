import { Injectable } from '@angular/core';
import { Resolve, RouterStateSnapshot, ActivatedRouteSnapshot, Router } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { ApiService } from '../../core/api.service';

@Injectable()
export class ConfigEditorResolver implements Resolve<any> {
  constructor(
    private $api: ApiService,
    private $toastr: ToastrService,
    private $router: Router,
  ) { }

  resolve(
    route: ActivatedRouteSnapshot,
    state: RouterStateSnapshot,
  ) {
    return this.$api.get('/config-editor').toPromise()
      .then((json) => {
        return JSON.stringify(json, null, 4);
      })
      .catch((err) => {
        this.$toastr.error(err.message, 'Failed to Load Config');
        this.$router.navigate(['/']);
      });
  }
}

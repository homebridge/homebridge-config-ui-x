import { Injectable } from '@angular/core';
import {
  ActivatedRouteSnapshot,
  Resolve,
  Router,
  RouterStateSnapshot,
} from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { ApiService } from '@/app/core/api.service';

@Injectable()
export class StartupScriptResolver implements Resolve<any> {
  constructor(
    private $api: ApiService,
    private $toastr: ToastrService,
    private $router: Router,
  ) {}

  resolve(
    route: ActivatedRouteSnapshot,
    state: RouterStateSnapshot,
  ) {
    return this.$api.get('/platform-tools/docker/startup-script').toPromise()
      .catch((err) => {
        this.$toastr.error(err.message, 'Failed to Load Startup Script');
        this.$router.navigate(['/']);
      });
  }
}

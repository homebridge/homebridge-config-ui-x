import { Component, OnInit, Input } from '@angular/core';

import { ApiService } from '../_services/api.service';
import { StateService } from '@uirouter/angular';
import { ToastsManager } from 'ng2-toastr/ng2-toastr';

@Component({
  selector: 'app-users',
  templateUrl: './users.component.html'
})
class UsersComponent implements OnInit {
  @Input() homebridgeUsers: Array<Object>;
  constructor() { }

  ngOnInit() {
  }

}

const UsersStates = {
  name: 'users',
  url: '/users',
  component: UsersComponent,
  resolve: [{
    token: 'homebridgeUsers',
    deps: [ApiService, ToastsManager, StateService],
    resolveFn: ($api, toastr, $state) => $api.getUsers().toPromise().catch((err) => {
      toastr.error(err.message, 'Failed to Load Users');
      $state.go('status');
    })
  }]
};

export { UsersComponent, UsersStates };

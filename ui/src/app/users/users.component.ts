import { Component, OnInit, Input } from '@angular/core';

import { StateService } from '@uirouter/angular';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { ToastsManager } from 'ng2-toastr/ng2-toastr';

import { ApiService } from '../_services/api.service';
import { UsersAddComponent } from './users.add.component';
import { UsersEditComponent } from './users.edit.component';

@Component({
  selector: 'app-users',
  templateUrl: './users.component.html'
})
export class UsersComponent implements OnInit {
  @Input() homebridgeUsers: Array<Object>;

  constructor(
    public toastr: ToastsManager,
    private modalService: NgbModal,
    private $api: ApiService,
    private $state: StateService,
  ) { }

  ngOnInit() {
  }

  openAddNewUser() {
    this.modalService.open(UsersAddComponent, {
      size: 'lg',
    });
  }

  openEditUser(user) {
    const ref = this.modalService.open(UsersEditComponent, {
      size: 'lg',
    });
    ref.componentInstance.user = user;
  }

  deleteUser(id) {
    this.$api.deleteUser(id).subscribe(
      data => {
        this.toastr.success('User Deleted', 'Success!');
        this.$state.reload();
      },
      err => {
        this.toastr.error(`Failed To Delete User`, 'Error');
      }
    );
  }

}

export function userStateResolve($api, toastr, $state) {
  return $api.getUsers().toPromise().catch((err) => {
    toastr.error(err.message, 'Failed to Load Users');
    $state.go('status');
  });
}

export const UsersStates = {
  name: 'users',
  url: '/users',
  component: UsersComponent,
  resolve: [{
    token: 'homebridgeUsers',
    deps: [ApiService, ToastsManager, StateService],
    resolveFn: userStateResolve
  }],
  data: {
    requiresAuth: true,
    requiresAdmin: true
  }
};

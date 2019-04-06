import { Component, OnInit, Input } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { StateService } from '@uirouter/angular';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { ToastrService } from 'ngx-toastr';

import { ApiService } from '../_services/api.service';
import { UsersAddComponent } from './users.add.component';
import { UsersEditComponent } from './users.edit.component';

@Component({
  selector: 'app-users',
  templateUrl: './users.component.html'
})
export class UsersComponent implements OnInit {
  @Input() homebridgeUsers: Array<any>;

  constructor(
    public toastr: ToastrService,
    private translate: TranslateService,
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
    this.$api.delete(`/users/${id}`).subscribe(
      data => {
        this.toastr.success(this.translate.instant('users.toast_user_deleted'), this.translate.instant('toast.title_success'));
        this.$state.reload();
      },
      err => {
        this.toastr.error(
          err.error.message || this.translate.instant('users.toast_failed_to_delete_user'),
          this.translate.instant('toast.title_error')
        );
      }
    );
  }

}

export function userStateResolve($api, toastr, $state) {
  return $api.get('/users').toPromise().catch((err) => {
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
    deps: [ApiService, ToastrService, StateService],
    resolveFn: userStateResolve
  }],
  data: {
    requiresAuth: true,
    requiresAdmin: true
  }
};


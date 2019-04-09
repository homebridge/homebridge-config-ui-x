import { Component, OnInit, Input } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { ToastrService } from 'ngx-toastr';

import { UsersAddComponent } from './users-add/users-add.component';
import { UsersEditComponent } from './users-edit/users-edit.component';
import { ApiService } from '../../core/api.service';


@Component({
  selector: 'app-users',
  templateUrl: './users.component.html'
})
export class UsersComponent implements OnInit {
  public homebridgeUsers: Array<any>;

  constructor(
    public toastr: ToastrService,
    private translate: TranslateService,
    private modalService: NgbModal,
    private $api: ApiService,
    private $route: ActivatedRoute,
  ) { }

  ngOnInit() {
    this.$route.data
      .subscribe((data: { homebridgeUsers: Array<any> }) => {
        this.homebridgeUsers = data.homebridgeUsers;
      });
  }

  reloadUsers() {
    return this.$api.get('/users').subscribe(
      (result) => {
        this.homebridgeUsers = result;
      }
    );
  }

  openAddNewUser() {
    const ref = this.modalService.open(UsersAddComponent, {
      size: 'lg',
    });

    ref.result.finally(() => {
      this.reloadUsers();
    });
  }

  openEditUser(user) {
    const ref = this.modalService.open(UsersEditComponent, {
      size: 'lg',
    });
    ref.componentInstance.user = user;

    ref.result.finally(() => {
      this.reloadUsers();
    });
  }

  deleteUser(id) {
    this.$api.delete(`/users/${id}`).subscribe(
      data => {
        this.toastr.success(this.translate.instant('users.toast_user_deleted'), this.translate.instant('toast.title_success'));
        this.reloadUsers();
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

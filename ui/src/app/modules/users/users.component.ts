import { Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { TranslateService } from '@ngx-translate/core';
import { ToastrService } from 'ngx-toastr';
import { ApiService } from '@/app/core/api.service';
import { AuthService } from '@/app/core/auth/auth.service';
import { UsersAddComponent } from '@/app/modules/users/users-add/users-add.component';
import { UsersDisable2faComponent } from '@/app/modules/users/users-disable2fa/users-disable2fa.component';
import { UsersEditComponent } from '@/app/modules/users/users-edit/users-edit.component';
import { UsersSetup2faComponent } from '@/app/modules/users/users-setup2fa/users-setup2fa.component';

@Component({
  selector: 'app-users',
  templateUrl: './users.component.html',
})
export class UsersComponent implements OnInit {
  public homebridgeUsers: Array<any>;

  constructor(
    public toastr: ToastrService,
    private translate: TranslateService,
    private modalService: NgbModal,
    private $api: ApiService,
    private $route: ActivatedRoute,
    public $auth: AuthService,
  ) {}

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
      },
    );
  }

  openAddNewUser() {
    const ref = this.modalService.open(UsersAddComponent, {
      size: 'lg',
      backdrop: 'static',
    });

    ref.result.finally(() => {
      this.reloadUsers();
    });
  }

  openEditUser(user) {
    const ref = this.modalService.open(UsersEditComponent, {
      size: 'lg',
      backdrop: 'static',
    });
    ref.componentInstance.user = user;

    ref.result.finally(() => {
      this.reloadUsers();
    });
  }

  deleteUser(id: string) {
    this.$api.delete(`/users/${id}`).subscribe(
      () => {
        this.toastr.success(this.translate.instant('users.toast_user_deleted'), this.translate.instant('toast.title_success'));
        this.reloadUsers();
      },
      (err) => {
        this.toastr.error(
          err.error.message || this.translate.instant('users.toast_failed_to_delete_user'),
          this.translate.instant('toast.title_error'),
        );
      },
    );
  }

  setup2fa(user) {
    const ref = this.modalService.open(UsersSetup2faComponent, {
      size: 'lg',
      backdrop: 'static',
    });
    ref.componentInstance.user = user;

    ref.result.finally(() => {
      this.reloadUsers();
    });
  }

  disable2fa(user) {
    const ref = this.modalService.open(UsersDisable2faComponent, {
      size: 'lg',
      backdrop: 'static',
    });
    ref.componentInstance.user = user;

    ref.result.finally(() => {
      this.reloadUsers();
    });
  }
}

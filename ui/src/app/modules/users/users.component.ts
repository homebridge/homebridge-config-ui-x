import { Component, inject, OnInit } from '@angular/core'
import { ActivatedRoute } from '@angular/router'
import { NgbModal } from '@ng-bootstrap/ng-bootstrap'
import { TranslatePipe, TranslateService } from '@ngx-translate/core'
import { ToastrService } from 'ngx-toastr'

import { ApiService } from '@/app/core/api.service'
import { AuthService } from '@/app/core/auth/auth.service'
import { Users2faDisableComponent } from '@/app/modules/users/users-2fa-disable/users-2fa-disable.component'
import { Users2faEnableComponent } from '@/app/modules/users/users-2fa-enable/users-2fa-enable.component'
import { UsersAddComponent } from '@/app/modules/users/users-add/users-add.component'
import { UsersEditComponent } from '@/app/modules/users/users-edit/users-edit.component'
import { User } from '@/app/modules/users/users.interface'

@Component({
  selector: 'app-users',
  templateUrl: './users.component.html',
  standalone: true,
  imports: [
    TranslatePipe,
  ],
})
export class UsersComponent implements OnInit {
  private $api = inject(ApiService)
  private $auth = inject(AuthService)
  private $modal = inject(NgbModal)
  private $route = inject(ActivatedRoute)
  private $toastr = inject(ToastrService)
  private $translate = inject(TranslateService)

  public homebridgeUsers: User[] = []
  public username = this.$auth.user.username

  public ngOnInit() {
    this.$route.data.subscribe((data: { homebridgeUsers: User[] }) => {
      this.homebridgeUsers = data.homebridgeUsers
    })
  }

  private reloadUsers() {
    return this.$api.get('/users').subscribe(
      (result: User[]) => {
        this.homebridgeUsers = result
      },
    )
  }

  public openAddNewUser() {
    const ref = this.$modal.open(UsersAddComponent, {
      size: 'lg',
      backdrop: 'static',
    })

    ref.result.finally(() => {
      this.reloadUsers()
    })
  }

  public openEditUser(user: User) {
    const ref = this.$modal.open(UsersEditComponent, {
      size: 'lg',
      backdrop: 'static',
    })
    ref.componentInstance.user = user

    ref.result.finally(() => {
      this.reloadUsers()
    })
  }

  public deleteUser(id: string) {
    this.$api.delete(`/users/${id}`).subscribe({
      next: () => {
        this.$toastr.success(this.$translate.instant('users.toast_user_deleted'), this.$translate.instant('toast.title_success'))
        this.reloadUsers()
      },
      error: (error) => {
        console.error(error)
        this.$toastr.error(error.error.message || this.$translate.instant('users.toast_failed_to_delete_user'), this.$translate.instant('toast.title_error'))
      },
    })
  }

  public setup2fa(user: User) {
    const ref = this.$modal.open(Users2faEnableComponent, {
      size: 'lg',
      backdrop: 'static',
    })
    ref.componentInstance.user = user

    ref.result.finally(() => {
      this.reloadUsers()
    })
  }

  public disable2fa(user: User) {
    const ref = this.$modal.open(Users2faDisableComponent, {
      size: 'lg',
      backdrop: 'static',
    })
    ref.componentInstance.user = user

    ref.result.finally(() => {
      this.reloadUsers()
    })
  }
}

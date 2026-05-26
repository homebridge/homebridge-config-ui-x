import { ChangeDetectionStrategy, Component, createEnvironmentInjector, DestroyRef, EnvironmentInjector, inject, OnInit, signal } from '@angular/core'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import { ActivatedRoute } from '@angular/router'
import { NgbModal } from '@ng-bootstrap/ng-bootstrap/modal'
import { TranslatePipe, TranslateService } from '@ngx-translate/core'
import { ToastrService } from 'ngx-toastr'

import { AuthService } from '@/app/core/auth/auth.service'
import { ApiService } from '@/app/core/communication/api.service'
import { ADD_USER_MODAL_DATA, USER_MODAL_DATA } from '@/app/core/modal-data-tokens'
import { SettingsService } from '@/app/core/ui/settings.service'
import { HttpErrorService } from '@/app/core/utilities/http-error.service'
import { Users2faDisableComponent } from '@/app/modules/users/users-2fa-disable/users-2fa-disable.component'
import { Users2faEnableComponent } from '@/app/modules/users/users-2fa-enable/users-2fa-enable.component'
import { UsersAddComponent } from '@/app/modules/users/users-add/users-add.component'
import { UsersEditComponent } from '@/app/modules/users/users-edit/users-edit.component'
import { UsersSupportComponent } from '@/app/modules/users/users-support/users-support.component'
import { User } from '@/app/modules/users/users.interface'

@Component({
  selector: 'app-users',
  imports: [
    TranslatePipe,
  ],
  standalone: true,
  templateUrl: './users.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UsersComponent implements OnInit {
  // Injected dependencies
  private injector = inject(EnvironmentInjector)
  private destroyRef = inject(DestroyRef)
  private $api = inject(ApiService)
  private $auth = inject(AuthService)
  private $errors = inject(HttpErrorService)
  private $modal = inject(NgbModal)
  private $route = inject(ActivatedRoute)
  private $settings = inject(SettingsService)
  private $toastr = inject(ToastrService)
  private $translate = inject(TranslateService)

  // Signals
  public readonly homebridgeUsers = signal<User[]>([])

  // Other properties
  public username = this.$auth.user.username
  public isAdmin = this.$auth.user.admin

  public ngOnInit(): void {
    // Set page title
    const title = this.$translate.instant('users.title_users')
    this.$settings.setPageTitle(title)

    this.$route.data
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((data: { homebridgeUsers?: User[] }) => {
        this.homebridgeUsers.set(data.homebridgeUsers ?? [])
      })
  }

  private async reloadUsers(): Promise<void> {
    try {
      const result: User[] = await this.$api.get('/users')
      this.homebridgeUsers.set(result)
    } catch (error: any) {
      // Without surfacing the failure, the user list silently stays
      // on its pre-mutation snapshot — the user just added a person
      // who appears to have vanished.
      console.error(error)
      this.$toastr.error(this.$errors.toToastMessage(error), this.$translate.instant('toast.title_error'))
    }
  }

  public async openAddNewUser(): Promise<void> {
    const injector = createEnvironmentInjector([{
      provide: ADD_USER_MODAL_DATA,
      useValue: {
        existingUsers: this.homebridgeUsers(),
      },
    }], this.injector)

    const ref = this.$modal.open(UsersAddComponent, {
      size: 'lg',
      backdrop: 'static',
      injector,
    })

    try {
      await ref.result
      void this.reloadUsers()
    } catch {
      // Modal dismissed, do nothing
    }
  }

  public async openEditUser(user: User): Promise<void> {
    const injector = createEnvironmentInjector([{
      provide: USER_MODAL_DATA,
      useValue: {
        user,
        existingUsers: this.homebridgeUsers(),
      },
    }], this.injector)

    const ref = this.$modal.open(UsersEditComponent, {
      size: 'lg',
      backdrop: 'static',
      injector,
    })

    try {
      await ref.result
      void this.reloadUsers()
    } catch {
      // Modal dismissed, do nothing
    }
  }

  public async setup2fa(user: User): Promise<void> {
    const injector = createEnvironmentInjector([{
      provide: USER_MODAL_DATA,
      useValue: {
        user,
      },
    }], this.injector)

    const ref = this.$modal.open(Users2faEnableComponent, {
      size: 'lg',
      backdrop: 'static',
      injector,
    })

    try {
      await ref.result
      void this.reloadUsers()
    } catch {
      // Modal dismissed, do nothing
    }
  }

  public async disable2fa(user: User): Promise<void> {
    const injector = createEnvironmentInjector([{
      provide: USER_MODAL_DATA,
      useValue: {
        user,
      },
    }], this.injector)

    const ref = this.$modal.open(Users2faDisableComponent, {
      size: 'lg',
      backdrop: 'static',
      injector,
    })

    try {
      await ref.result
      void this.reloadUsers()
    } catch {
      // Modal dismissed, do nothing
    }
  }

  public openSupport(): void {
    this.$modal.open(UsersSupportComponent, {
      size: 'lg',
      backdrop: 'static',
    })
  }
}

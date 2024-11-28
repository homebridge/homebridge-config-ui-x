import { Users2faDisableComponent } from '@/app/modules/users/users-2fa-disable/users-2fa-disable.component'
import { Users2faEnableComponent } from '@/app/modules/users/users-2fa-enable/users-2fa-enable.component'
import { UsersAddComponent } from '@/app/modules/users/users-add/users-add.component'
import { UsersEditComponent } from '@/app/modules/users/users-edit/users-edit.component'
import { UsersRoutingModule } from '@/app/modules/users/users-routing.module'
import { UsersComponent } from '@/app/modules/users/users.component'
import { UsersResolver } from '@/app/modules/users/users.resolver'
import { CommonModule } from '@angular/common'
import { NgModule } from '@angular/core'
import { FormsModule, ReactiveFormsModule } from '@angular/forms'
import { NgbModule } from '@ng-bootstrap/ng-bootstrap'
import { TranslateModule } from '@ngx-translate/core'

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    TranslateModule.forChild(),
    NgbModule,
    UsersRoutingModule,
    UsersComponent,
    UsersAddComponent,
    UsersEditComponent,
    Users2faEnableComponent,
    Users2faDisableComponent,
  ],
  providers: [
    UsersResolver,
  ],
})
export class UsersModule {}

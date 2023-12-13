import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { NgbModule } from '@ng-bootstrap/ng-bootstrap';
import { TranslateModule } from '@ngx-translate/core';
import { CoreModule } from '@/app/core/core.module';
import { UsersAddComponent } from '@/app/modules/users/users-add/users-add.component';
import { UsersDisable2faComponent } from '@/app/modules/users/users-disable2fa/users-disable2fa.component';
import { UsersEditComponent } from '@/app/modules/users/users-edit/users-edit.component';
import { UsersRoutingModule } from '@/app/modules/users/users-routing.module';
import { UsersSetup2faComponent } from '@/app/modules/users/users-setup2fa/users-setup2fa.component';
import { UsersComponent } from '@/app/modules/users/users.component';
import { UsersResolver } from '@/app/modules/users/users.resolver';

@NgModule({
  declarations: [
    UsersComponent,
    UsersAddComponent,
    UsersEditComponent,
    UsersSetup2faComponent,
    UsersDisable2faComponent,
  ],
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    TranslateModule.forChild(),
    NgbModule,
    CoreModule,
    UsersRoutingModule,
  ],
  providers: [
    UsersResolver,
  ],
})
export class UsersModule {}

import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { NgbModule } from '@ng-bootstrap/ng-bootstrap';
import { TranslateModule } from '@ngx-translate/core';
import { UsersAddComponent } from './users-add/users-add.component';
import { UsersDisable2faComponent } from './users-disable2fa/users-disable2fa.component';
import { UsersEditComponent } from './users-edit/users-edit.component';
import { UsersRoutingModule } from './users-routing.module';
import { UsersSetup2faComponent } from './users-setup2fa/users-setup2fa.component';
import { UsersComponent } from './users.component';
import { UsersResolver } from './users.resolver';
import { CoreModule } from '@/app/core/core.module';

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

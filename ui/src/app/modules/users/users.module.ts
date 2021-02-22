import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { NgbModule } from '@ng-bootstrap/ng-bootstrap';

import { CoreModule } from '@/app/core/core.module';
import { UsersRoutingModule } from './users-routing.module';
import { UsersComponent } from './users.component';
import { UsersAddComponent } from './users-add/users-add.component';
import { UsersEditComponent } from './users-edit/users-edit.component';
import { UsersResolver } from './users.resolver';
import { UsersSetup2faComponent } from './users-setup2fa/users-setup2fa.component';
import { UsersDisable2faComponent } from './users-disable2fa/users-disable2fa.component';

@NgModule({
  entryComponents: [
    UsersAddComponent,
    UsersEditComponent,
    UsersSetup2faComponent,
    UsersDisable2faComponent,
  ],
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
export class UsersModule { }

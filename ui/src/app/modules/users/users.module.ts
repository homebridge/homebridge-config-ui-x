import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

import { UsersRoutingModule } from './users-routing.module';
import { UsersComponent } from './users.component';
import { UsersAddComponent } from './users-add/users-add.component';
import { UsersEditComponent } from './users-edit/users-edit.component';
import { UsersResolver } from './users.resolver';
import { TranslateModule } from '@ngx-translate/core';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { NgbModule } from '@ng-bootstrap/ng-bootstrap';

@NgModule({
  entryComponents: [
    UsersAddComponent,
    UsersEditComponent,
  ],
  declarations: [
    UsersComponent,
    UsersAddComponent,
    UsersEditComponent,
  ],
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    TranslateModule.forChild(),
    NgbModule,
    UsersRoutingModule
  ],
  providers: [
    UsersResolver,
  ]
})
export class UsersModule { }

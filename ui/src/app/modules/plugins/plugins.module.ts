import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { TranslateModule } from '@ngx-translate/core';
import { NgbModule } from '@ng-bootstrap/ng-bootstrap';

import { CoreModule } from '../../core/core.module';
import { PluginsRoutingModule } from './plugins-routing.module';
import { InstalledPluginsComponent } from './installed-plugins/installed-plugins.component';
import { SearchPluginsComponent } from './search-plugins/search-plugins.component';
import { ManagePluginsModule } from '../../core/manage-plugins/manage-plugins.module';

@NgModule({
  declarations: [
    InstalledPluginsComponent,
    SearchPluginsComponent,
  ],
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    TranslateModule.forChild(),
    NgbModule,
    CoreModule,
    ManagePluginsModule,
    PluginsRoutingModule,
  ]
})
export class PluginsModule { }

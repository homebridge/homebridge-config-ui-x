import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { TranslateModule } from '@ngx-translate/core';
import { NgbModule } from '@ng-bootstrap/ng-bootstrap';

import { CoreModule } from '@/app/core/core.module';
import { ManagePluginsModule } from '@/app/core/manage-plugins/manage-plugins.module';
import { PluginsRoutingModule } from './plugins-routing.module';
import { InstalledPluginsComponent } from './installed-plugins/installed-plugins.component';
import { SearchPluginsComponent } from './search-plugins/search-plugins.component';
import { DonateModalComponent } from './donate-modal/donate-modal.component';

@NgModule({
  entryComponents: [
    DonateModalComponent,
  ],
  declarations: [
    InstalledPluginsComponent,
    SearchPluginsComponent,
    DonateModalComponent,
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
  ],
})
export class PluginsModule { }

import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { TranslateModule } from '@ngx-translate/core';
import { NgbModule } from '@ng-bootstrap/ng-bootstrap';
import { DragulaModule } from 'ng2-dragula';

import { CoreModule } from '../../core/core.module';
import { AccessoriesCoreModule } from '../../core/accessories/accessories.module';
import { AccessoriesRoutingModule } from './accessories-routing.module';
import { DragHerePlaceholderComponent } from './drag-here-placeholder/drag-here-placeholder.component';
import { AddRoomModalComponent } from './add-room-modal/add-room-modal.component';

import { AccessoriesComponent } from './accessories.component';

@NgModule({
  declarations: [
    AccessoriesComponent,
    DragHerePlaceholderComponent,
    AddRoomModalComponent,
  ],
  entryComponents: [
    AddRoomModalComponent,
  ],
  imports: [
    CommonModule,
    FormsModule,
    NgbModule,
    DragulaModule,
    TranslateModule.forChild(),
    CoreModule,
    AccessoriesCoreModule,
    AccessoriesRoutingModule,
  ],
})
export class AccessoriesModule { }

import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NgbModule } from '@ng-bootstrap/ng-bootstrap';
import { TranslateModule } from '@ngx-translate/core';
import { DragulaModule } from 'ng2-dragula';
import { AccessoriesCoreModule } from '@/app/core/accessories/accessories.module';
import { CoreModule } from '@/app/core/core.module';
import { AccessoriesRoutingModule } from '@/app/modules/accessories/accessories-routing.module';
import { AccessoriesComponent } from '@/app/modules/accessories/accessories.component';
import { AddRoomModalComponent } from '@/app/modules/accessories/add-room-modal/add-room-modal.component';
import { DragHerePlaceholderComponent } from '@/app/modules/accessories/drag-here-placeholder/drag-here-placeholder.component';

@NgModule({
  declarations: [
    AccessoriesComponent,
    DragHerePlaceholderComponent,
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
export class AccessoriesModule {}

import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NgbModule } from '@ng-bootstrap/ng-bootstrap';
import { TranslateModule } from '@ngx-translate/core';
import { DragulaModule } from 'ng2-dragula';
import { AccessoriesRoutingModule } from './accessories-routing.module';
import { AccessoriesComponent } from './accessories.component';
import { AddRoomModalComponent } from './add-room-modal/add-room-modal.component';
import { DragHerePlaceholderComponent } from './drag-here-placeholder/drag-here-placeholder.component';
import { AccessoriesCoreModule } from '@/app/core/accessories/accessories.module';
import { CoreModule } from '@/app/core/core.module';

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
export class AccessoriesModule { }

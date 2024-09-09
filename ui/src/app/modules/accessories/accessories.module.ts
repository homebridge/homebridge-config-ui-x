import { AccessoriesCoreModule } from '@/app/core/accessories/accessories.module'
import { CoreModule } from '@/app/core/core.module'
import { AccessoriesComponent } from '@/app/modules/accessories/accessories.component'
import { AccessoriesRoutingModule } from '@/app/modules/accessories/accessories-routing.module'
import { AddRoomComponent } from '@/app/modules/accessories/add-room/add-room.component'
import { DragHerePlaceholderComponent } from '@/app/modules/accessories/drag-here-placeholder/drag-here-placeholder.component'
import { CommonModule } from '@angular/common'
import { NgModule } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { NgbModule } from '@ng-bootstrap/ng-bootstrap'
import { TranslateModule } from '@ngx-translate/core'
import { DragulaModule } from 'ng2-dragula'

@NgModule({
  declarations: [
    AccessoriesComponent,
    DragHerePlaceholderComponent,
    AddRoomComponent,
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

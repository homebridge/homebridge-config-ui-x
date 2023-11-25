import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { TranslateModule } from '@ngx-translate/core';
import { LinuxRoutingModule } from './linux-routing.module';
import { LinuxComponent } from './linux.component';
import { RestartLinuxComponent } from './restart-linux/restart-linux.component';
import { ShutdownLinuxComponent } from './shutdown-linux/shutdown-linux.component';
import { CoreModule } from '@/app/core/core.module';

@NgModule({
  declarations: [
    LinuxComponent,
    RestartLinuxComponent,
    ShutdownLinuxComponent,
  ],
  imports: [
    CommonModule,
    TranslateModule.forChild(),
    CoreModule,
    LinuxRoutingModule,
  ],
})
export class LinuxModule {}

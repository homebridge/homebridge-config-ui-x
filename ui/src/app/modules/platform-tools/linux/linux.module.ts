import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { TranslateModule } from '@ngx-translate/core';
import { CoreModule } from '@/app/core/core.module';
import { LinuxRoutingModule } from '@/app/modules/platform-tools/linux/linux-routing.module';
import { LinuxComponent } from '@/app/modules/platform-tools/linux/linux.component';
import { RestartLinuxComponent } from '@/app/modules/platform-tools/linux/restart-linux/restart-linux.component';
import { ShutdownLinuxComponent } from '@/app/modules/platform-tools/linux/shutdown-linux/shutdown-linux.component';

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

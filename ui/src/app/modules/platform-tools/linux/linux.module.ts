import { LinuxRoutingModule } from '@/app/modules/platform-tools/linux/linux-routing.module'
import { RestartLinuxComponent } from '@/app/modules/platform-tools/linux/restart-linux/restart-linux.component'
import { ShutdownLinuxComponent } from '@/app/modules/platform-tools/linux/shutdown-linux/shutdown-linux.component'
import { CommonModule } from '@angular/common'
import { NgModule } from '@angular/core'
import { TranslateModule } from '@ngx-translate/core'

@NgModule({
  imports: [
    CommonModule,
    TranslateModule.forChild(),
    LinuxRoutingModule,
    RestartLinuxComponent,
    ShutdownLinuxComponent,
  ],
})
export class LinuxModule {}

import { LoginComponent } from '@/app/modules/login/login.component'
import { LoginGuard } from '@/app/modules/login/login.guard'
import { CommonModule } from '@angular/common'
import { NgModule } from '@angular/core'
import { FormsModule, ReactiveFormsModule } from '@angular/forms'
import { TranslateModule } from '@ngx-translate/core'

@NgModule({
  declarations: [
    LoginComponent,
  ],
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    TranslateModule,
  ],
  providers: [
    LoginGuard,
  ],
})
export class LoginModule {}

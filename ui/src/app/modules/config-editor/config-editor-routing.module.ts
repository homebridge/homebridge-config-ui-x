import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { ConfigEditorComponent } from '@/app/modules/config-editor/config-editor.component';
import { ConfigEditorResolver } from '@/app/modules/config-editor/config-editor.resolver';

const routes: Routes = [
  {
    path: '',
    component: ConfigEditorComponent,
    resolve: {
      config: ConfigEditorResolver,
    },
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class ConfigEditorRoutingModule {}

import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';
import { DockerComponent } from './docker.component';

const routes: Routes = [
  {
    path: '',
    component: DockerComponent,
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class DockerRoutingModule { }

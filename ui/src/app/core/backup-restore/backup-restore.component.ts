import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { saveAs } from 'file-saver';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import { ToastrService } from 'ngx-toastr';

import { ApiService } from '../api.service';
import { WsService } from '../ws.service';

@Component({
  selector: 'app-backup-restore',
  templateUrl: './backup-restore.component.html',
  styleUrls: ['./backup-restore.component.scss'],
})
export class BackupRestoreComponent implements OnInit {
  public clicked = false;
  public selectedFile: File;
  public restoreInProgress = false;
  public restoreStarted = false;

  private term = new Terminal();
  private termTarget: HTMLElement;
  private fitAddon = new FitAddon();

  private io = this.$ws.connectToNamespace('backup');

  constructor(
    private $route: Router,
    public activeModal: NgbActiveModal,
    public $toastr: ToastrService,
    private $api: ApiService,
    private $ws: WsService,
  ) { }

  ngOnInit() {
    this.termTarget = document.getElementById('plugin-log-output');
    this.term.open(this.termTarget);
    this.fitAddon.fit();

    this.io.socket.on('stdout', (data) => {
      this.term.write(data);
    });
  }

  async onDownloadBackupClick() {
    this.clicked = true;
    this.$api.get('/backup/download', { observe: 'response', responseType: 'blob' }).subscribe(
      (res) => {
        const archiveName = res.headers.get('File-Name') || 'homebridge-backup.tar.gz';
        saveAs(res.body, archiveName);
        this.clicked = false;
        this.activeModal.close();
        this.$toastr.success('Backup Archive Created', 'Success');
      },
      (err) => {
        this.clicked = false;
      },
    );
  }

  onRestoreBackupClick() {
    this.term.reset();
    this.clicked = true;
    const formData: FormData = new FormData();
    formData.append('restoreArchive', this.selectedFile, this.selectedFile.name);
    this.$api.post('/backup/restore', formData).subscribe(
      (res) => {
        this.restoreStarted = true;
        this.restoreInProgress = true;
        setTimeout(() => {
          this.startRestore();
        }, 500);
        this.clicked = false;
      },
      (err) => {
        this.clicked = false;
      },
    );
  }

  async startRestore() {
    await this.io.request('do-restore').toPromise();
    this.restoreInProgress = false;
    this.$toastr.success('Backup Archive Restored', 'Success');
  }

  handleRestoreFileInput(files: FileList) {
    if (files.length) {
      this.selectedFile = files[0];
    } else {
      delete this.selectedFile;
    }
  }

  postBackupRestart() {
    this.$api.put('/backup/restart', {}).subscribe(
      (res) => {
        this.activeModal.close();
        this.$route.navigate(['/']);
      },
      (err) => {

      },
    );
  }


}

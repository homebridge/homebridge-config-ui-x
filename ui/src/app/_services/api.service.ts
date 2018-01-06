import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs/Observable';
import { Text } from '@angular/compiler/src/i18n/i18n_ast';

@Injectable()
export class ApiService {
  private base = 'http://localhost:8080';

  constructor(private $http: HttpClient) {}

  getServerInfo() {
    return this.$http.get(`${this.base}/api/server`);
  }

  getHomebridgePlugin() {
    return this.$http.get(`${this.base}/api/plugins/homebridge`);
  }

  getInstalledPlugins() {
    return this.$http.get(`${this.base}/api/plugins`);
  }

  searchNpmForPlugins(query) {
    return this.$http.get(`${this.base}/api/plugins`, {params: {search: query}});
  }

  installPlugin(pluginName) {
    return this.$http.post(`${this.base}/api/plugins/install`, {package: pluginName});
  }

  uninstallPlugin(pluginName) {
    return this.$http.post(`${this.base}/api/plugins/uninstall`, { package: pluginName });
  }

  updatePlugin(pluginName) {
    return this.$http.put(`${this.base}/api/plugins/update`, { package: pluginName });
  }

  loadConfig() {
    return this.$http.get(`${this.base}/api/config`, {responseType: 'text'});
  }

  saveConfig(config) {
    return this.$http.post(`${this.base}/api/config`, config);
  }

  downloadConfigBackup() {
    window.location.href = `${this.base}/api/config/backup`;
  }

  getUsers() {
    return this.$http.get(`${this.base}/api/users`);
  }
}

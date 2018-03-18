import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';

import { environment } from '../../environments/environment';

@Injectable()
export class ApiService {
  private base = environment.apiBaseUrl;
  private httpOptions = environment.apiHttpOptions;

  constructor(private $http: HttpClient) {}

  getAppSettings() {
    return this.$http.get(`${this.base}/api/settings`, this.httpOptions);
  }

  login(username, password) {
    return this.$http.post(`${this.base}/api/login`, { username: username, password: password }, this.httpOptions);
  }

  getToken() {
    return this.$http.get(`${this.base}/api/server/token`, this.httpOptions);
  }

  getQrCode() {
    return this.$http.get(`${this.base}/api/server/qrcode.svg`, Object.assign({ responseType: 'text' as 'text' }, this.httpOptions));
  }

  resetHomebridgeAccessory() {
    return this.$http.put(`${this.base}/api/server/reset-homebridge`, {}, this.httpOptions);
  }

  restartServer() {
    return this.$http.put(`${this.base}/api/server/restart`, {}, this.httpOptions);
  }

  getHomebridgePackage() {
    return this.$http.get(`${this.base}/api/packages/homebridge`, this.httpOptions);
  }

  upgradeHomebridgePackage() {
    return this.$http.put(`${this.base}/api/packages/homebridge/upgrade`, {}, this.httpOptions);
  }

  getInstalledPlugins() {
    return this.$http.get(`${this.base}/api/packages`, this.httpOptions);
  }

  searchNpmForPlugins(query) {
    return this.$http.get(`${this.base}/api/packages`, Object.assign({params: {search: query}}, this.httpOptions), );
  }

  installPlugin(pluginName) {
    return this.$http.post(`${this.base}/api/packages/install`, {package: pluginName}, this.httpOptions);
  }

  uninstallPlugin(pluginName) {
    return this.$http.post(`${this.base}/api/packages/uninstall`, { package: pluginName }, this.httpOptions);
  }

  updatePlugin(pluginName) {
    return this.$http.put(`${this.base}/api/packages/update`, { package: pluginName }, this.httpOptions);
  }

  getPluginChangeLog(pluginName) {
    return this.$http.get(`${this.base}/api/packages/changelog/${pluginName}`, this.httpOptions);
  }

  loadConfig() {
  return this.$http.get(`${this.base}/api/config`, Object.assign({ responseType: 'text' as 'text' }, this.httpOptions));
  }

  saveConfig(config) {
    return this.$http.post(`${this.base}/api/config`, config, this.httpOptions);
  }

  getUsers() {
    return this.$http.get(`${this.base}/api/users`, this.httpOptions);
  }

  addNewUser(user) {
    return this.$http.post(`${this.base}/api/users`, user, this.httpOptions);
  }

  updateUser(userId, user) {
    return this.$http.put(`${this.base}/api/users/${userId}`, user, this.httpOptions);
  }

  deleteUser(userId) {
    return this.$http.delete(`${this.base}/api/users/${userId}`, this.httpOptions);
  }

  getAccessoryLayout() {
    return this.$http.get(`${this.base}/api/accessories/layout`, this.httpOptions);
  }

  updateAccessoryLayout(layout) {
    return this.$http.post(`${this.base}/api/accessories/layout`, layout, this.httpOptions);
  }

  dockerGetStartupScript(layout) {
    return this.$http.get(`${this.base}/api/docker/startup-script`, Object.assign({ responseType: 'text' as 'text' }, this.httpOptions));
  }

  dockerSaveStartupScript(payload) {
    return this.$http.post(`${this.base}/api/docker/startup-script`, payload, this.httpOptions);
  }

  dockerRestartContainer() {
    return this.$http.put(`${this.base}/api/docker/restart-container`, {}, this.httpOptions);
  }

  dockerGetEnv() {
    return this.$http.get(`${this.base}/api/docker/env`, this.httpOptions);
  }

  dockerSaveEnv(payload) {
    return this.$http.put(`${this.base}/api/docker/env`, payload, this.httpOptions);
  }

  linuxRestartServer() {
    return this.$http.put(`${this.base}/api/linux/restart-server`, {}, this.httpOptions);
  }

  linuxShutdownServer() {
    return this.$http.put(`${this.base}/api/linux/shutdown-server`, {}, this.httpOptions);
  }
}

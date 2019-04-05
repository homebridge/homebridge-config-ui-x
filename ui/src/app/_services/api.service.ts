import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';

import { environment } from '../../environments/environment';
import { Observable } from 'rxjs';

@Injectable()
export class ApiService {
  private base = environment.apiBaseUrl;
  private httpOptions = environment.apiHttpOptions;

  constructor(private $http: HttpClient) { }

  get(url: string, options?): Observable<any> {
    return this.$http.get(`${environment.api.base}${url}`, options);
  }

  post(url: string, body: any | null, options?): Observable<any> {
    return this.$http.post(`${environment.api.base}${url}`, body, options);
  }

  put(url: string, body: any | null, options?): Observable<any> {
    return this.$http.put(`${environment.api.base}${url}`, body, options);
  }

  patch(url: string, body: any | null, options?): Observable<any> {
    return this.$http.patch(`${environment.api.base}${url}`, body, options);
  }

  delete(url: string, options?): Observable<any> {
    return this.$http.delete(`${environment.api.base}${url}`, options);
  }

  getQrCode() {
    return this.$http.get(`${this.base}/api/settings`, this.httpOptions);
  }

  resetHomebridgeAccessory() {
    return this.$http.get(`${this.base}/api/settings`, this.httpOptions);
  }

  restartServer() {
    return this.$http.get(`${this.base}/api/settings`, this.httpOptions);
  }

  getHomebridgePackage() {
    return this.$http.get(`${this.base}/api/settings`, this.httpOptions);
  }

  upgradeHomebridgePackage() {
    return this.$http.get(`${this.base}/api/settings`, this.httpOptions);
  }

  getInstalledPlugins() {
    return this.$http.get(`${this.base}/api/settings`, this.httpOptions);
  }

  searchNpmForPlugins(query) {
    return this.$http.get(`${this.base}/api/settings`, this.httpOptions);
  }

  installPlugin(pluginName) {
    return this.$http.get(`${this.base}/api/settings`, this.httpOptions);
  }

  uninstallPlugin(pluginName) {
    return this.$http.get(`${this.base}/api/settings`, this.httpOptions);
  }

  updatePlugin(pluginName) {
    return this.$http.get(`${this.base}/api/settings`, this.httpOptions);
  }

  getPluginChangeLog(pluginName) {
    return this.$http.get(`${this.base}/api/settings`, this.httpOptions);
  }

  getPluginConfigSchema(pluginName) {
    return this.$http.get(`${this.base}/api/settings`, this.httpOptions);
  }

  getConfig() {
    return this.$http.get(`${this.base}/api/settings`, this.httpOptions);
  }

  loadConfig() {
    return this.$http.get(`${this.base}/api/settings`, this.httpOptions);
  }

  saveConfig(config) {
    return this.$http.get(`${this.base}/api/settings`, this.httpOptions);
  }

  getConfigBackupList() {
    return this.$http.get(`${this.base}/api/settings`, this.httpOptions);
  }

  getConfigBackup(backupId) {
    return this.$http.get(`${this.base}/api/settings`, this.httpOptions);
  }

  deleteConfigBackups() {
    return this.$http.get(`${this.base}/api/settings`, this.httpOptions);
  }

  getUsers() {
    return this.$http.get(`${this.base}/api/settings`, this.httpOptions);
  }

  addNewUser(user) {
    return this.$http.get(`${this.base}/api/settings`, this.httpOptions);
  }

  updateUser(userId, user) {
    return this.$http.get(`${this.base}/api/settings`, this.httpOptions);
  }

  deleteUser(userId) {
    return this.$http.get(`${this.base}/api/settings`, this.httpOptions);
  }

  getAccessoryLayout() {
    return this.$http.get(`${this.base}/api/settings`, this.httpOptions);
  }

  updateAccessoryLayout(layout) {
    return this.$http.get(`${this.base}/api/settings`, this.httpOptions);
  }

  dockerGetStartupScript(layout) {
    return this.$http.get(`${this.base}/api/settings`, this.httpOptions);
  }

  dockerSaveStartupScript(payload) {
    return this.$http.get(`${this.base}/api/settings`, this.httpOptions);
  }

  dockerRestartContainer() {
    return this.$http.get(`${this.base}/api/settings`, this.httpOptions);
  }

  dockerGetEnv() {
    return this.$http.get(`${this.base}/api/settings`, this.httpOptions);
  }

  dockerSaveEnv(payload) {
    return this.$http.get(`${this.base}/api/settings`, this.httpOptions);
  }

  linuxRestartServer() {
    return this.$http.get(`${this.base}/api/settings`, this.httpOptions);
  }

  linuxShutdownServer() {
    return this.$http.get(`${this.base}/api/settings`, this.httpOptions);
  }
}

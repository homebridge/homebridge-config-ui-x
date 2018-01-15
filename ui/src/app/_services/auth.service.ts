import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs/Observable';
import { JwtHelper } from 'angular2-jwt';

import { environment } from '../../environments/environment';

interface HomebridgeUser {
  token: string;
  username?: string;
  name?: string;
  admin?: boolean;
}

@Injectable()
export class AuthService {
  private base = environment.apiBaseUrl;
  private httpOptions = environment.apiHttpOptions;
  private jwtHelper: JwtHelper = new JwtHelper();

  public user: HomebridgeUser;

  constructor(
    private $http: HttpClient
  ) {
    this.loadToken();
  }

  isLoggedIn() {
    return this.user && this.user.token && !this.jwtHelper.isTokenExpired(this.user.token);
  }

  login(username: string, password: string) {
    return this.$http.post(`${this.base}/api/login`, {username: username, password: password}, this.httpOptions).toPromise()
      .then((user: any) => {
        window.localStorage.setItem('token', user.token);
        return this.parseToken(user.token);
      });
  }

  logout() {
    this.user = null;
    window.localStorage.removeItem('token');
    window.location.reload();
  }

  parseToken(token: string) {
    let decoded;
    try {
       decoded = this.jwtHelper.decodeToken(token);
    } catch (e) {
       return window.localStorage.removeItem('token');
    }

    this.user = {
      token: token,
      username: decoded.username,
      name: decoded.name,
      admin: decoded.admin
    };
  }

  loadToken() {
    const token = window.localStorage.getItem('token');
    if (token) {
      this.parseToken(token);
    }
  }

}

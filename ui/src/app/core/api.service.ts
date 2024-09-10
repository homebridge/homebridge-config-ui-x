import { environment } from '@/environments/environment'
import { HttpClient } from '@angular/common/http'
import { Injectable } from '@angular/core'
import { Observable } from 'rxjs'

@Injectable({
  providedIn: 'root',
})
export class ApiService {
  constructor(private $http: HttpClient) {}

  get(url: string, options?): Observable<any> {
    return this.$http.get(`${environment.api.base}${url}`, options)
  }

  post(url: string, body: any | null, options?): Observable<any> {
    return this.$http.post(`${environment.api.base}${url}`, body, options)
  }

  put(url: string, body: any | null, options?): Observable<any> {
    return this.$http.put(`${environment.api.base}${url}`, body, options)
  }

  patch(url: string, body: any | null, options?): Observable<any> {
    return this.$http.patch(`${environment.api.base}${url}`, body, options)
  }

  delete(url: string, options?): Observable<any> {
    return this.$http.delete(`${environment.api.base}${url}`, options)
  }
}

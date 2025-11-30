import { HttpClient } from '@angular/common/http'
import { inject, Injectable } from '@angular/core'
import { firstValueFrom } from 'rxjs'

import { environment } from '@/environments/environment'

@Injectable({
  providedIn: 'root',
})
export class ApiService {
  private $http = inject(HttpClient)

  public get<T = any>(url: string, options?): Promise<T> {
    return firstValueFrom(this.$http.get<T>(`${environment.api.base}${url}`, options)) as Promise<T>
  }

  public post<T = any>(url: string, body: any | null, options?): Promise<T> {
    return firstValueFrom(this.$http.post<T>(`${environment.api.base}${url}`, body, options)) as Promise<T>
  }

  public put<T = any>(url: string, body: any | null, options?): Promise<T> {
    return firstValueFrom(this.$http.put<T>(`${environment.api.base}${url}`, body, options)) as Promise<T>
  }

  public patch<T = any>(url: string, body: any | null, options?): Promise<T> {
    return firstValueFrom(this.$http.patch<T>(`${environment.api.base}${url}`, body, options)) as Promise<T>
  }

  public delete<T = any>(url: string, options?): Promise<T> {
    return firstValueFrom(this.$http.delete<T>(`${environment.api.base}${url}`, options)) as Promise<T>
  }
}

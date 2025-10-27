export interface User {
  id: number
  name: string
  username: string
  admin: boolean
  otpActive: boolean
  password?: string
  passwordConfirm?: string
}

export interface ApiToken {
  id: string
  name: string
  token?: string // Only included when token is first created
  createdAt: Date | string
  lastUsed?: Date | string
}

export interface User {
  id: number
  name: string
  username: string
  admin: boolean
  otpActive: boolean
  password?: string
  passwordConfirm?: string
}

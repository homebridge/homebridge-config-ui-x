import { InjectionToken } from '@angular/core'

export interface AddRoomModalData {
  existingRooms: Array<{ name: string, isDefault?: boolean }>
}

export interface EditRoomModalData {
  roomName: string
  isDefault: boolean
  existingRooms: Array<{ name: string, isDefault?: boolean }>
  currentRoomIndex: number
}

export const ADD_ROOM_MODAL_DATA = new InjectionToken<AddRoomModalData>('ADD_ROOM_MODAL_DATA')
export const EDIT_ROOM_MODAL_DATA = new InjectionToken<EditRoomModalData>('EDIT_ROOM_MODAL_DATA')

import { Injectable } from '@angular/core'

@Injectable({
  providedIn: 'root',
})
export class ColourService {
  public miredToKelvin(kelvin: number): number {
    return Math.round(1000000 / kelvin)
  }

  public kelvinToMired(kelvin: number): number {
    return Math.round(1000000 / kelvin)
  }

  public kelvinToHsl(kelvin: number): string {
    const temp = kelvin / 100
    let red: number, green: number, blue: number
    if (temp <= 66) {
      red = 255
      green = Math.min(99.4708025861 * Math.log(temp) - 161.1195681661, 255)
      blue = temp <= 19 ? 0 : Math.min(138.5177312231 * Math.log(temp - 10) - 305.0447927307, 255)
    } else {
      red = Math.min(329.698727446 * (temp - 60) ** -0.1332047592, 255)
      green = Math.min(288.1221695283 * (temp - 60) ** -0.0755148492, 255)
      blue = 255
    }
    red /= 255
    green /= 255
    blue /= 255
    const max = Math.max(red, green, blue)
    const min = Math.min(red, green, blue)
    const delta = max - min
    let hue = 0
    if (delta !== 0) {
      if (max === red) {
        hue = ((green - blue) / delta) % 6
      } else if (max === green) {
        hue = (blue - red) / delta + 2
      } else {
        hue = (red - green) / delta + 4
      }
      hue = Math.round(hue * 60)
      if (hue < 0) {
        hue += 360
      }
    }
    const lightness = (max + min) / 2
    const saturation = delta === 0 ? 0 : delta / (1 - Math.abs(2 * lightness - 1))
    return `hsl(${Math.round(hue)}, ${Math.round(saturation * 100)}%, ${Math.round(lightness * 100)}%)`
  }
}

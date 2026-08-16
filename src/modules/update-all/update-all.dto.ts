import { ArrayNotEmpty, IsArray, IsDefined } from 'class-validator'

export class UpdateAllStartDto {
  // Each entry is { name, to } - the server re-validates every entry against
  // a freshly computed plan, so shape checking beyond "a non-empty array"
  // adds nothing the service does not already enforce.
  @IsDefined()
  @IsArray()
  @ArrayNotEmpty()
  items: { name: string, to: string }[]
}

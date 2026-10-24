import { Characteristics } from '@homebridge/hap-client/hap-types'

// Register only the experimental picker characteristics that compatible plugins publish.
Object.assign(Characteristics, {
  '5B530C0B-C1DF-496C-9151-52EAB77FD424': 'ThemeCatalog',
  'ThemeCatalog': '5B530C0B-C1DF-496C-9151-52EAB77FD424',
  'AAEA8272-2EEC-40EC-8C03-0E15FCA30F18': 'ThemeSelection',
  'ThemeSelection': 'AAEA8272-2EEC-40EC-8C03-0E15FCA30F18',
  'C48B8A28-40D3-4F51-B51C-A5D39D985991': 'ThemePicker',
  'ThemePicker': 'C48B8A28-40D3-4F51-B51C-A5D39D985991',
  '3D8F8A5E-06EC-4780-8C83-0DAAC35B7269': 'ThemeFavorites',
  'ThemeFavorites': '3D8F8A5E-06EC-4780-8C83-0DAAC35B7269',
})

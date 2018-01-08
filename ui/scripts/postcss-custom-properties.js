let fs = require('fs')

function changeFile (file, currLine, newLine) {
  if (!fs.existsSync(file)) return
  let data = fs.readFileSync(file, 'utf8')
  let result = data.replace(currLine, newLine)

  fs.writeFile(file, result, err => {
    if (err) console.log(err)
  })
}

let pkg = './node_modules/postcss-custom-properties/dist/index.js'
let searchFileForString = 'warnings: options.warnings === undefined ? true : options.warnings,'
let replaceFileWithString = 'warnings: options.warnings === undefined ? false : options.warnings,'

changeFile(pkg, searchFileForString, replaceFileWithString)

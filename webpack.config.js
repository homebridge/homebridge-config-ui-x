const path = require('node:path')

const webpack = require('webpack')

const packageJson = require('./package.json')

const externals = {}

for (const dep of Object.keys(packageJson.dependencies)) {
  externals[dep] = dep
}

module.exports = {
  entry: {
    server: './src/main.ts',
  },
  output: {
    filename: 'main.js',
    path: path.join(__dirname, 'dist'),
    libraryTarget: 'commonjs',
  },
  target: 'node',
  mode: 'production',
  externals,
  node: {
    global: false,
    __filename: false,
    __dirname: false,
  },
  resolve: {
    extensions: ['.tsx', '.ts', '.js'],
  },
  module: {
    rules: [
      {
        test: /.tsx?$/,
        use: 'ts-loader',
        exclude: /node_modules/,
      },
    ],
  },
  optimization: {
    minimize: false,
  },
  plugins: [
    new webpack.IgnorePlugin({ resourceRegExp: /^\.\/locale$/, contextRegExp: /@nestjs\/microservices/ }),
    new webpack.IgnorePlugin({ resourceRegExp: /^\.\/locale$/, contextRegExp: /@nestjs\/platform-express/ }),
    new webpack.IgnorePlugin({ resourceRegExp: /^\.\/locale$/, contextRegExp: /swagger-ui-express/ }),
    new webpack.IgnorePlugin({ resourceRegExp: /^\.\/locale$/, contextRegExp: /cache-manager/ }),
    new webpack.IgnorePlugin({ resourceRegExp: /^\.\/locale$/, contextRegExp: /osx-temperature-sensor/ }),
  ],
}

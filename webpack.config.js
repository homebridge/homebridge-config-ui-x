/* eslint-disable @typescript-eslint/no-var-requires */

const webpack = require('webpack');
const path = require('path');

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
  externals: {
    'axios': 'axios',
    'fsevents': 'fsevents',
    'node-pty-prebuilt-multiarch': 'node-pty-prebuilt-multiarch',
    '@nestjs/common': '@nestjs/common',
    '@nestjs/core': '@nestjs/core',
    '@nestjs/platform-fastify': '@nestjs/platform-fastify',
    '@nestjs/platform-socket.io': '@nestjs/platform-socket.io',
    '@nestjs/websockets': '@nestjs/websockets',
    '@nestjs/swagger': '@nestjs/swagger',
    '@nestjs/jwt': '@nestjs/jwt',
    '@nestjs/passport': '@nestjs/passport',
    '@oznu/hap-client': '@oznu/hap-client',
    'fastify-swagger': 'fastify-swagger',
    'reflect-metadata': 'reflect-metadata',
    'rxjs': 'rxjs',
    'class-transformer': 'class-transformer',
    'class-validator': 'class-validator',
    'commander': 'commander',
    'fastify': 'fastify',
    'fastify-static': 'fastify-static',
    'fastify-multipart': 'fastify-multipart',
    'fs-extra': 'fs-extra',
    'helmet': 'helmet',
    'semver': 'semver',
    'systeminformation': 'systeminformation',
    'tcp-port-used': 'tcp-port-used',
    'tar': 'tar',
    'ora': 'ora'
  },
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
    new webpack.IgnorePlugin(/@nestjs\/microservices/),
    new webpack.IgnorePlugin(/@nestjs\/platform-express/),
    new webpack.IgnorePlugin(/swagger-ui-express/),
    new webpack.IgnorePlugin(/cache-manager/),
    new webpack.IgnorePlugin(/osx-temperature-sensor/)
  ],
};

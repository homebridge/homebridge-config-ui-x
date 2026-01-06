import { Buffer } from 'node:buffer'
import { existsSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import process from 'node:process'

import { Injectable } from '@nestjs/common'
import { ensureDir } from 'fs-extra/esm'
import forge from 'node-forge'

import { Logger } from '../logger/logger.service.js'

interface SslCertificateData {
  privateKey: Buffer
  certificate: Buffer
}

/**
 * Service to generate self-signed SSL certificates dynamically
 */
@Injectable()
export class SslCertGeneratorService {
  private readonly logger = new Logger(SslCertGeneratorService.name)
  private readonly certDir: string
  private readonly privateKeyPath: string
  private readonly certificatePath: string

  constructor() {
    const storagePath = process.env.UIX_STORAGE_PATH || resolve(homedir(), '.homebridge')
    this.certDir = join(storagePath, 'ssl-certs')
    this.privateKeyPath = join(this.certDir, 'private-key.pem')
    this.certificatePath = join(this.certDir, 'certificate.pem')
  }

  /**
   * Generate or load a self-signed certificate
   * @param hostnames Optional array of hostnames to include in the certificate
   */
  async generateOrLoadCertificate(hostnames: string[] = ['localhost']): Promise<SslCertificateData> {
    // Check if certificate already exists
    if (existsSync(this.privateKeyPath) && existsSync(this.certificatePath)) {
      try {
        const privateKey = await readFile(this.privateKeyPath)
        const certificate = await readFile(this.certificatePath)
        this.logger.log('Loaded existing self-signed certificate')
        return { privateKey, certificate }
      } catch (error) {
        this.logger.warn('Failed to load existing certificate, generating new one:', error.message)
      }
    }

    // Generate new certificate
    return this.generateCertificate(hostnames)
  }

  /**
   * Generate a new self-signed certificate
   * @param hostnames Array of hostnames to include in the certificate
   */
  public async generateCertificate(hostnames: string[]): Promise<SslCertificateData> {
    this.logger.log('Generating self-signed certificate...')

    try {
      // Ensure the cert directory exists
      await ensureDir(this.certDir)

      // Generate a key pair
      const keys = forge.pki.rsa.generateKeyPair(2048)

      // Create a certificate
      const cert = forge.pki.createCertificate()
      cert.publicKey = keys.publicKey
      cert.serialNumber = '01'

      // Set validity period (25 years from now, until 2050)
      cert.validity.notBefore = new Date()
      cert.validity.notAfter = new Date('2050-01-01T00:00:00Z')

      // Set certificate attributes
      const attrs = [
        { name: 'commonName', value: hostnames[0] || 'localhost' },
        { name: 'countryName', value: 'US' },
        { shortName: 'ST', value: 'State' },
        { name: 'localityName', value: 'City' },
        { name: 'organizationName', value: 'Homebridge' },
        { shortName: 'OU', value: 'Homebridge UI' },
      ]

      cert.setSubject(attrs)
      cert.setIssuer(attrs)

      // Add extensions
      const extensions = [
        {
          name: 'basicConstraints',
          cA: true,
        },
        {
          name: 'keyUsage',
          keyCertSign: true,
          digitalSignature: true,
          nonRepudiation: true,
          keyEncipherment: true,
          dataEncipherment: true,
        },
        {
          name: 'extKeyUsage',
          serverAuth: true,
          clientAuth: true,
        },
        {
          name: 'subjectAltName',
          altNames: hostnames.map((hostname) => {
            // Check if hostname is an IP address
            if (/^(?:\d{1,3}\.){3}\d{1,3}$/.test(hostname) || /^(?:[0-9a-f]{0,4}:){2,7}[0-9a-f]{0,4}$/i.test(hostname)) {
              return {
                type: 7, // IP
                ip: hostname,
              }
            } else {
              return {
                type: 2, // DNS
                value: hostname,
              }
            }
          }),
        },
      ]

      cert.setExtensions(extensions)

      // Self-sign certificate
      cert.sign(keys.privateKey, forge.md.sha256.create())

      // Convert to PEM format
      const privateKeyPem = forge.pki.privateKeyToPem(keys.privateKey)
      const certificatePem = forge.pki.certificateToPem(cert)

      // Save to disk
      await writeFile(this.privateKeyPath, privateKeyPem, 'utf8')
      await writeFile(this.certificatePath, certificatePem, 'utf8')

      this.logger.log(`Self-signed certificate generated successfully for: ${hostnames.join(', ')}`)

      return {
        privateKey: Buffer.from(privateKeyPem),
        certificate: Buffer.from(certificatePem),
      }
    } catch (error) {
      this.logger.error('Failed to generate self-signed certificate:', error)
      throw error
    }
  }
}

import { randomUUID } from 'node:crypto'
import { join } from 'node:path'

import { BadRequestException, Inject, Injectable } from '@nestjs/common'
import { mkdirp, pathExists, readJson } from 'fs-extra/esm'

import { ConfigService } from '../../core/config/config.service.js'
import { JsonFileStoreService } from '../../core/fs/json-file-store.service.js'
import { SmartAutomation } from './smart-automations.interfaces.js'

@Injectable()
export class SmartAutomationsService {
  constructor(
    @Inject(ConfigService) private readonly configService: ConfigService,
    @Inject(JsonFileStoreService) private readonly jsonStore: JsonFileStoreService,
  ) {}

  public async getSmartAutomations(username: string) {
    try {
      const smartAutomations = await readJson(this.getSmartAutomationsPath()) as Record<string, SmartAutomation[]>
      return (smartAutomations[username] || []).map(automation => ({
        ...automation,
        enabled: automation.enabled ?? true,
      }))
    } catch {
      return []
    }
  }

  public async saveSmartAutomation(username: string, automation: Partial<SmartAutomation>) {
    if (!automation?.name || typeof automation.name !== 'string') {
      throw new BadRequestException('Automation name is required.')
    }

    if (automation.type !== 'smart-light-group') {
      throw new BadRequestException('Unsupported automation type.')
    }

    const uniqueIds = [...new Set(automation.uniqueIds || [])].filter(x => typeof x === 'string' && x.length > 0)
    if (!uniqueIds.length) {
      throw new BadRequestException('At least one light uniqueId is required.')
    }

    const restoreAfterMs = Number.isInteger(automation.restoreAfterMs) ? automation.restoreAfterMs! : 30000
    if (restoreAfterMs < 1000 || restoreAfterMs > 86_400_000) {
      throw new BadRequestException('restoreAfterMs must be between 1000 and 86400000.')
    }

    const enabled = typeof automation.enabled === 'boolean' ? automation.enabled : true

    if (!await pathExists(join(this.configService.storagePath, 'accessories'))) {
      await mkdirp(join(this.configService.storagePath, 'accessories'))
    }

    const saved = {
      id: automation.id || randomUUID(),
      name: automation.name.trim(),
      type: 'smart-light-group' as const,
      uniqueIds,
      restoreAfterMs,
      enabled,
    }

    await this.jsonStore.mutate<Record<string, SmartAutomation[]>>(this.getSmartAutomationsPath(), (current) => {
      const next = current || {}
      const userAutomations = next[username] || []
      const existingIndex = userAutomations.findIndex(x => x.id === saved.id)
      if (existingIndex === -1) {
        next[username] = [...userAutomations, saved]
      } else {
        next[username] = userAutomations.map(item => item.id === saved.id ? saved : item)
      }
      return next
    })

    return saved
  }

  public async deleteSmartAutomation(username: string, id: string) {
    if (!id || typeof id !== 'string') {
      throw new BadRequestException('Automation id is required.')
    }

    await this.jsonStore.mutate<Record<string, SmartAutomation[]>>(this.getSmartAutomationsPath(), (current) => {
      if (!current || !current[username]) {
        return current
      }

      const next = { ...current }
      next[username] = next[username].filter(x => x.id !== id)
      return next
    })

    return { id }
  }

  private getSmartAutomationsPath() {
    return join(this.configService.storagePath, 'accessories', 'smart-automations.json')
  }
}

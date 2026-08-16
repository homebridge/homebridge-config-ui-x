import { randomUUID } from 'node:crypto'
import { resolve } from 'node:path'

import { Inject, Injectable } from '@nestjs/common'

import { ConfigService } from '../../core/config/config.service.js'
import { JsonFileStoreService } from '../../core/fs/json-file-store.service.js'
import { Logger } from '../../core/logger/logger.service.js'
import { UpdateAllItemStatus, UpdateAllJournal, UpdateAllJournalItem } from './update-all.interfaces.js'

/** How many lines of an item's update output the journal keeps */
const LOG_TAIL_LINES = 30

/**
 * The journal is the record of the most recent Update All run, persisted so it
 * survives the one thing an in-memory record cannot: the run's own final step
 * kills the UI process when the UI updates itself. The freshly restarted UI
 * reads the journal back to show the user what happened.
 *
 * Latest run only - each new run replaces the file (decided by BP,
 * 2026-08-15). All writes go through the JsonFileStoreService, so they are
 * atomic and serialised per path.
 */
@Injectable()
export class UpdateAllJournalService {
  constructor(
    @Inject(ConfigService) private readonly configService: ConfigService,
    @Inject(JsonFileStoreService) private readonly jsonStore: JsonFileStoreService,
    @Inject(Logger) private readonly logger: Logger,
  ) {}

  private get journalPath(): string {
    return resolve(this.configService.storagePath, '.uix-update-all-journal.json')
  }

  /**
   * The latest run, or null when there has never been one. A corrupt or
   * unreadable journal also reads as null - the journal is a convenience
   * record, and failing an endpoint over it would make a bad run worse.
   */
  async read(): Promise<UpdateAllJournal | null> {
    try {
      const journal = await this.jsonStore.read<UpdateAllJournal>(this.journalPath)
      if (!journal || journal.schemaVersion !== 1 || !Array.isArray(journal.items)) {
        return null
      }
      return journal
    } catch {
      return null
    }
  }

  /** Start a new run, replacing any previous journal. Returns the run id. */
  async startRun(items: Array<Omit<UpdateAllJournalItem, 'status'>>): Promise<string> {
    const journal: UpdateAllJournal = {
      schemaVersion: 1,
      runId: randomUUID(),
      startedAt: new Date().toISOString(),
      acknowledged: false,
      items: items.map(item => ({ ...item, status: 'planned' as const })),
      restart: { homebridge: 'pending', ui: 'pending' },
    }
    await this.jsonStore.write(this.journalPath, journal)
    return journal.runId
  }

  /**
   * Record an item's state change. The log tail is capped here, at write
   * time, so the journal has one owner of that rule and cannot grow
   * unbounded.
   */
  async updateItem(name: string, status: UpdateAllItemStatus, extra: { reason?: string, logTail?: string[] } = {}): Promise<void> {
    await this.mutate((journal) => {
      const item = journal.items.find(x => x.name === name)
      if (!item) {
        return
      }
      item.status = status
      if (extra.reason !== undefined) {
        item.reason = extra.reason
      }
      if (extra.logTail !== undefined) {
        item.logTail = extra.logTail.slice(-LOG_TAIL_LINES)
      }
    })
  }

  /** Record the finale's restart outcomes and stamp the finish time. */
  async finishRun(restart: UpdateAllJournal['restart']): Promise<void> {
    await this.mutate((journal) => {
      journal.finishedAt = new Date().toISOString()
      journal.restart = restart
    })
  }

  /** Mark the latest run as seen, so the summary shows only once. Idempotent. */
  async acknowledge(): Promise<void> {
    await this.mutate((journal) => {
      journal.acknowledged = true
    })
  }

  private async mutate(mutator: (journal: UpdateAllJournal) => void): Promise<void> {
    try {
      await this.jsonStore.mutate<UpdateAllJournal>(this.journalPath, (current) => {
        if (!current || current.schemaVersion !== 1) {
          // Nothing (valid) to update - skip the write rather than invent a run
          return null
        }
        mutator(current)
        return current
      })
    } catch (e) {
      // A journal write must never fail the run it is describing
      this.logger.warn(`Could not update the update-all journal as ${e.message}.`)
    }
  }
}

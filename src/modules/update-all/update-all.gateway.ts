import type { EventEmitter } from 'node:events'

import { Inject, UseGuards } from '@nestjs/common'
import { SubscribeMessage, WebSocketGateway, WsException } from '@nestjs/websockets'

import { WsAdminGuard } from '../../core/auth/guards/ws-admin-guard.js'
import { devServerCorsConfig } from '../../core/cors.config.js'
import { Logger } from '../../core/logger/logger.service.js'
import { UpdateAllJournalService } from './update-all-journal.service.js'
import { UpdateAllService } from './update-all.service.js'

/** The progress events the orchestrator emits, forwarded verbatim to subscribers */
const FORWARDED_EVENTS = ['item-start', 'stdout', 'item-result', 'run-complete'] as const

/**
 * Streams Update All progress to the browser. A client sends `subscribe` and
 * gets a snapshot back - whether a run is active, plus the journal as it
 * stands - then receives the live events as the orchestrator emits them. The
 * snapshot is read AFTER subscribing, and the orchestrator writes the journal
 * before each event, so a joiner can miss nothing: anything not yet in the
 * snapshot arrives as an event.
 */
@UseGuards(WsAdminGuard)
@WebSocketGateway({
  namespace: '/update-all',
  allowEIO3: true,
  cors: devServerCorsConfig,
})
export class UpdateAllGateway {
  private readonly subscribers = new Set<EventEmitter>()

  constructor(
    @Inject(Logger) private readonly logger: Logger,
    @Inject(UpdateAllJournalService) private readonly journalService: UpdateAllJournalService,
    @Inject(UpdateAllService) private readonly updateAllService: UpdateAllService,
  ) {
    for (const event of FORWARDED_EVENTS) {
      this.updateAllService.events.on(event, payload => this.broadcast(event, payload))
    }
  }

  @SubscribeMessage('subscribe')
  async subscribe(client: EventEmitter) {
    try {
      this.subscribers.add(client)
      client.on('disconnect', () => {
        this.subscribers.delete(client)
      })

      return {
        active: this.updateAllService.isRunning,
        journal: await this.journalService.read(),
      }
    } catch (e) {
      this.logger.error(`Update All subscribe failed: ${e.message}.`)
      return new WsException(e.message)
    }
  }

  /**
   * One subscriber's socket erroring must never break the run or the other
   * subscribers, so each emit is fenced individually.
   */
  private broadcast(event: string, payload: any): void {
    for (const client of this.subscribers) {
      try {
        client.emit(event, payload)
      } catch (e) {
        this.logger.debug(`Update All: dropping a progress subscriber that failed on ${event} (${e.message}).`)
        this.subscribers.delete(client)
      }
    }
  }
}

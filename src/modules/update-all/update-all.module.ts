import { Module } from '@nestjs/common'
import { PassportModule } from '@nestjs/passport'

import { ConfigModule } from '../../core/config/config.module.js'
import { FsModule } from '../../core/fs/fs.module.js'
import { HomebridgeIpcModule } from '../../core/homebridge-ipc/homebridge-ipc.module.js'
import { LoggerModule } from '../../core/logger/logger.module.js'
import { BackupModule } from '../backup/backup.module.js'
import { ChildBridgesModule } from '../child-bridges/child-bridges.module.js'
import { PluginsModule } from '../plugins/plugins.module.js'
import { UpdateAllJournalService } from './update-all-journal.service.js'
import { UpdateAllController } from './update-all.controller.js'
import { UpdateAllGateway } from './update-all.gateway.js'
import { UpdateAllService } from './update-all.service.js'

/**
 * Update All: one button that updates outdated plugins, Homebridge, and the
 * UI itself, with one restart at the end and a per-item report.
 *
 * How a run works, end to end:
 *
 * 1. `GET /update-all/plan` computes what would update (a pure read).
 *    Exclusions carry the first matching reason: `hidden` (hideUpdatesFor),
 *    `disabled`, `major` (goes to needsReview - majors are updated
 *    individually, never by the batch), `engines` (needs a newer Node.js or
 *    Homebridge). The user unticks anything, confirms.
 * 2. `POST /update-all/start` re-validates the confirmed items against a
 *    FRESH plan (names + target versions must still match - the run's items
 *    and order come from the plan, never the client), reserves the singleton
 *    slot (a second start gets 409), and returns the run id.
 * 3. The loop: instance backup first, then each item serially - Homebridge,
 *    then the UI, then plugins A→Z. A failed plugin does not stop the rest;
 *    a failed Homebridge update skips the UI item. `POST /update-all/cancel`
 *    stops between items - the item npm is on always finishes.
 * 4. The finale performs the smallest restart that covers everything: a full
 *    Homebridge restart if Homebridge or any main-bridge plugin updated
 *    (which restarts every child bridge too), otherwise just the collected
 *    child bridges, otherwise nothing. Then the journal's final state is
 *    written, and only THEN is the UI's own restart timer armed.
 * 5. Progress streams over the `update-all` ws namespace (`subscribe` →
 *    `{active, journal}` snapshot, then item-start/stdout/item-result/
 *    run-complete). The journal is written before each event, so a late
 *    joiner can see a duplicate but never a gap.
 *
 * The journal (`<storagePath>/.uix-update-all-journal.json`, latest run
 * only) is the record that survives the UI restarting itself: per-item
 * status with reasons and capped log tails, plus what restarts happened.
 * Reading a failed run: `failed` items carry the npm error and output tail;
 * `skipped` items say why (cancelled, Homebridge failed first, or the run
 * stopped unexpectedly); a journal whose items are still running/planned
 * means the process died mid-run - the frontend shows those as "did not
 * finish". The browser shows the summary once, then acknowledges it via
 * `POST /update-all/journal/ack`.
 */
@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    ConfigModule,
    FsModule,
    LoggerModule,
    PluginsModule,
    BackupModule,
    ChildBridgesModule,
    HomebridgeIpcModule,
  ],
  providers: [
    UpdateAllJournalService,
    UpdateAllService,
    UpdateAllGateway,
  ],
  controllers: [
    UpdateAllController,
  ],
  exports: [
    UpdateAllJournalService,
    UpdateAllService,
  ],
})
export class UpdateAllModule {}

import { Injectable } from '@nestjs/common'
import { cancelJob, RecurrenceRule, scheduledJobs, scheduleJob } from 'node-schedule'

@Injectable()
export class SchedulerService {
  public readonly scheduleJob = scheduleJob
  public readonly scheduledJobs = scheduledJobs
  public readonly cancelJob = cancelJob
  public readonly RecurrenceRule = RecurrenceRule
}

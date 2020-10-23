import { Injectable } from '@nestjs/common';
import * as schedule from 'node-schedule';

@Injectable()
export class SchedulerService {
  public readonly scheduleJob = schedule.scheduleJob;
  public readonly scheduledJobs = schedule.scheduledJobs;
}

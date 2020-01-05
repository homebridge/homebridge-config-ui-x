import { ServiceType } from '@oznu/hap-client';

export type ServiceTypeX = ServiceType & {
  customName?: string,
  hidden?: boolean,
  onDashboard?: boolean,
};

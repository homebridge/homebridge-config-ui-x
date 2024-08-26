// Global defaults for the application, shared between the ui and server

global.backup = {
  // Maximum size of a backup file in bytes
  maxBackupSize: 25 * 1024 * 1024,
  maxBackupSizeText: '25MB',
  // Maximum size of an individual file within backup in bytes
  maxBackupFileSize: 10 * 1024 * 1024,
  maxBackupFileSizeText: '10MB',
};

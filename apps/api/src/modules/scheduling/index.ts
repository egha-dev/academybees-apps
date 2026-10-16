// Scheduling module's public interface (CLAUDE.md §7).
export { SchedulingModule } from './scheduling.module.js';
export { SchedulingService } from './scheduling.service.js';
export { SessionGenerationQueue } from './generation.queue.js';
export { BatchesService } from './batches.service.js';
export { attends, batchLoads, overCapacity } from './batch-load.js';
export { batchPolicy, sessionPolicy } from './scheduling.policy.js';
export { localTime, SessionsService } from './sessions.service.js';

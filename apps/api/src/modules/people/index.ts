// People module's public interface (CLAUDE.md §7: modules talk through exported services).
export { CustomFieldsService } from './custom-fields.service.js';
export { EnrolmentsService } from './enrolments.service.js';
export { HubLinkService } from './family/hub-link.service.js';
export { ParentAccessService } from './family/parent-access.service.js';
export { ParentsService } from './parents.service.js';
export { PeopleModule } from './people.module.js';
export { PeopleService } from './people.service.js';
export { StudentsService } from './students.service.js';
export { ImportService } from './import/import.service.js';
export {
  csvCell,
  detectType,
  INVALID_DATE,
  normaliseHeader,
  parseDate,
  parseRows,
  UnreadableFileError,
} from './import/parse.js';

// Conventional Commits (ADR-041). The same rules check PR titles in CI.
export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    // Subjects often start with product or library names (BullMQ, Prisma, NestJS).
    'subject-case': [0],
    'body-max-line-length': [0],
    'footer-max-line-length': [0],
  },
};

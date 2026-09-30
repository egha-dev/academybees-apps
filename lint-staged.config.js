// Fast checks on staged files only; full lint/typecheck/test run in CI and before push.
export default {
  '*.{js,mjs,cjs,ts,tsx,json,yml,yaml,css}': 'prettier --write',
};

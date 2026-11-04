import 'server-only';

import { getMessages } from 'next-intl/server';

/** Every sheet's strings, with the error labels they share. */
export async function financeLabels() {
  const messages = await getMessages();
  const ui = messages.finance.ui;
  const errors = {
    finance: ui.errors,
    people: { ...messages.people.errors, offline: messages.people.form.offline },
  };
  const shared = { close: ui.plans.close, cancel: ui.plans.cancel, errors };
  return {
    plans: { ...ui.plans, errors },
    assign: { ...ui.assign, ...shared },
    assignments: { ...ui.assignments, ...shared },
    oneTime: {
      ...ui.oneTime,
      search: ui.assign.search,
      searchHint: ui.assign.searchHint,
      noMatch: ui.assign.noMatch,
      student: ui.assign.student,
      selectNone: ui.assign.selectNone,
      ...shared,
    },
  };
}

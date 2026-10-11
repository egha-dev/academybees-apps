#!/usr/bin/env node
// Create a Family Hub join request through the real API (C-107), for checking the academy's
// Join requests queue before the hub screens exist (Phase 7P). Local and staging only.
//   pnpm hub:join-request --academy demo-a --email parent@demo-a.test \
//     --parent "Ravi Kumar" --child "Aarav Sharma" [--phone 9840012345] [--hub http://app.localhost:3000]
// Locally the demo password is used; elsewhere set HUB_PASSWORD or type it when asked.
// The account must be able to sign in to the Family Hub (an ACTIVE parent or student somewhere).
const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : fallback;
};
const hub = arg('hub', 'http://app.localhost:3000').replace(/\/+$/, '');
const academy = arg('academy');
const email = arg('email');
const local = /localhost/.test(hub);
// Never pass a real password as a flag (shell history): staging reads HUB_PASSWORD or asks.
const password =
  arg('password') ?? process.env.HUB_PASSWORD ?? (local ? 'AcademyBees#2026' : await ask());

async function ask() {
  if (!process.stdin.isTTY) {
    console.error('Set HUB_PASSWORD, or run in a terminal to be asked for the password.');
    process.exit(1);
  }
  process.stdout.write(`Password for ${arg('email')}: `);
  process.stdin.setRawMode(true);
  process.stdin.resume();
  let value = '';
  for await (const chunk of process.stdin) {
    for (const ch of chunk.toString('utf8')) {
      if (ch === '\r' || ch === '\n') {
        process.stdin.setRawMode(false);
        process.stdin.pause();
        process.stdout.write('\n');
        return value;
      }
      if (ch === '\u0003') process.exit(130);
      if (ch === '\u007f') value = value.slice(0, -1);
      else value += ch;
    }
  }
  return value;
}
const parentName = arg('parent', 'Join Request Parent');
const childName = arg('child');
const phone = arg('phone');
if (!academy || !email || !childName) {
  console.error(
    'Usage: pnpm hub:join-request --academy <slug> --email <hub account> --child <name> [--parent <name>] [--phone <mobile>] [--hub <origin>]',
  );
  process.exit(1);
}
if (/academybees\.com$/.test(new URL(hub).hostname) && !/staging/.test(hub)) {
  console.error('Refusing: production hub. This helper is for local and staging only.');
  process.exit(1);
}

const login = await fetch(`${hub}/api/v1/auth/login`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', accept: 'application/json' },
  body: JSON.stringify({ identifier: email, password }),
});
if (!login.ok) {
  console.error(`✖ Family Hub sign-in failed (${login.status}): ${await login.text()}`);
  process.exit(1);
}
const cookies = login.headers.getSetCookie().map((c) => c.split(';')[0]);
const csrf =
  cookies
    .find((c) => /^(__Host-)?ab_csrf=/.test(c))
    ?.split('=')
    .slice(1)
    .join('=') ?? '';
const res = await fetch(
  `${hub}/api/v1/hub/academies/${encodeURIComponent(academy)}/join-requests`,
  {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json',
      cookie: cookies.join('; '),
      'x-csrf-token': decodeURIComponent(csrf),
    },
    body: JSON.stringify({ parentName, childName, ...(phone ? { phone } : {}) }),
  },
);
if (res.status !== 202) {
  console.error(`✖ Join request failed (${res.status}): ${await res.text()}`);
  process.exit(1);
}
console.log(
  `✔ Join request sent to ${academy} as ${email}. It appears in that academy's Join requests.`,
);

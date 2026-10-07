/**
 * Continue on the Family Hub after an academy sign-in (C-61). The one-time code travels in the
 * fragment, which browsers never send to a server or put in a Referer (C-73). Another origin
 * (`app.`), so a full load is the only way there.
 */
export function continueToHub(hubOrigin: string, code: string): void {
  window.location.assign(`${hubOrigin}/auth/handoff#code=${encodeURIComponent(code)}`);
}

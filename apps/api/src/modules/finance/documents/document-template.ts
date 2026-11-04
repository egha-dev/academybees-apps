import { type AppLocale, createServerTranslator, formatDate, formatMoney } from '@academybee/i18n';

import type { InvoiceSnapshot, ReceiptSnapshot } from './document-snapshot.js';

export type InvoiceView = {
  kind: 'INVOICE';
  number: string;
  issueDate: string;
  dueDate: string;
  currency: string;
  creditAppliedMinor: number;
  snapshot: InvoiceSnapshot;
};
export type ReceiptView = { kind: 'RECEIPT'; number: string; snapshot: ReceiptSnapshot };
export type DocumentView = InvoiceView | ReceiptView;
export type RenderAssets = { fontCss: string; fontFamily: string; logoDataUri: string | null };

/** Everything printed comes from people, so everything printed is escaped. */
export const esc = (text: string): string =>
  text.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );

const safeColor = (color: string | null | undefined) =>
  color && /^#[0-9a-fA-F]{6}$/.test(color) ? color : '#1f2937';

const row = (label: string, value: string, strong = false) =>
  `<tr class="${strong ? 'strong' : ''}"><td>${esc(label)}</td><td class="num">${esc(value)}</td></tr>`;

/** All the text a document will print, to choose its fonts. */
export const documentText = (view: DocumentView): string => JSON.stringify(view.snapshot);

const STYLES = (assets: RenderAssets, color: string) => `
${assets.fontCss}
*{box-sizing:border-box}
html,body{margin:0;padding:0}
body{font-family:${assets.fontFamily};color:#111827;font-size:12px;line-height:1.45}
.page{padding-block:12mm;padding-inline:14mm}
body.MOBILE{font-size:13px}
body.MOBILE .page{padding-block:6mm;padding-inline:6mm}
header{display:flex;justify-content:space-between;gap:12px;border-block-end:2px solid ${color};padding-block-end:10px;margin-block-end:14px}
body.MOBILE header{flex-direction:column}
.logo{max-block-size:48px;max-inline-size:160px;display:block;margin-block-end:6px}
.academy{font-size:16px;font-weight:700}
h1{margin:0;font-size:18px;color:${color}}
.number{font-weight:700}
.meta{display:grid;grid-template-columns:1fr 1fr;gap:6px 16px;margin-block-end:14px}
body.MOBILE .meta{grid-template-columns:1fr}
.label{color:#4b5563}
table{inline-size:100%;border-collapse:collapse;margin-block-end:12px}
th{text-align:start;border-block-end:1px solid #9ca3af;padding-block:4px;font-weight:700}
td{padding-block:4px;border-block-end:1px solid #e5e7eb;vertical-align:top}
.num{text-align:end;white-space:nowrap;padding-inline-start:12px}
.strong td{font-weight:700;font-size:14px;border-block-end:0}
.totals{margin-inline-start:auto;inline-size:60%}
body.MOBILE .totals{inline-size:100%}
.note{color:#4b5563;font-size:11px;margin-block-start:12px}
`;

function shell(
  view: DocumentView,
  layout: 'A4' | 'MOBILE',
  assets: RenderAssets,
  title: string,
  gstin: string | null,
  gstinLabel: string | null,
  body: string,
  locale: string,
): string {
  const { academy } = view.snapshot;
  const color = safeColor(academy.primaryColor);
  return `<!doctype html><html lang="${esc(locale)}"><head><meta charset="utf-8"><title>${esc(title)} ${esc(view.number)}</title><style>${STYLES(assets, color)}</style></head>
<body class="${layout}"><div class="page"><header><div>
${assets.logoDataUri ? `<img class="logo" alt="" src="${assets.logoDataUri}">` : ''}
<div class="academy">${esc(academy.name)}</div>
${gstin && gstinLabel ? `<div>${esc(gstinLabel)}</div>` : ''}
</div><div><h1>${esc(title)}</h1><div class="number">${esc(view.number)}</div></div></header>
${body}</div></body></html>`;
}

/** The whole document as one HTML string; no scripts and no external requests (C-160). */
export function renderDocumentHtml(
  view: DocumentView,
  layout: 'A4' | 'MOBILE',
  assets: RenderAssets,
  locale: AppLocale = 'en-IN',
): string {
  const t = createServerTranslator('finance', locale);
  const m = (minor: number, currency: string) => formatMoney(minor, currency, { locale });
  const d = (date: string) => formatDate(date, { locale });
  const meta = (label: string, value: string) =>
    `<div><div class="label">${esc(label)}</div><div>${esc(value)}</div></div>`;
  const student = (heading: string, s: { name: string; admissionNo?: string | null | undefined }) =>
    meta(
      heading,
      s.admissionNo
        ? `${s.name} · ${t('document.admissionNo', { number: s.admissionNo })}`
        : s.name,
    );

  if (view.kind === 'RECEIPT') {
    const s = view.snapshot;
    const body = `<div class="meta">
${student(t('document.receivedFrom'), s.student)}
${meta(t('document.paidOn'), d(s.paidOn))}
${meta(t('document.method'), t(`document.methods.${s.method as 'CASH'}`))}
${s.reference ? meta(t('document.reference'), s.reference) : ''}
</div>
<table class="totals"><tbody>${row(t('document.amountReceived'), m(s.amountMinor, s.currency), true)}</tbody></table>
${
  s.allocations.length
    ? `<table><thead><tr><th>${esc(t('document.appliedTo'))}</th><th class="num">${esc(t('document.amount'))}</th><th class="num">${esc(t('document.invoiceBalance'))}</th></tr></thead><tbody>
${s.allocations
  .map(
    (a) =>
      `<tr><td>${esc(a.invoiceNumber)}</td><td class="num">${esc(m(a.amountMinor, s.currency))}</td><td class="num">${esc(m(a.balanceAfterMinor, s.currency))}</td></tr>`,
  )
  .join('')}</tbody></table>`
    : ''
}
${s.creditMinor > 0 ? `<table class="totals"><tbody>${row(t('document.toCredit'), m(s.creditMinor, s.currency))}</tbody></table>` : ''}
<p class="note">${esc(t('document.receiptNote'))}</p>`;
    return shell(
      view,
      layout,
      assets,
      t('document.receiptTitle'),
      s.gstin,
      s.gstin ? t('document.gstin', { gstin: s.gstin }) : null,
      body,
      locale,
    );
  }

  const s = view.snapshot;
  const { currency } = view;
  const { totals } = s;
  const rate = s.tax ? s.tax.rateBps / 100 : 0;
  const balance = totals.totalMinor - view.creditAppliedMinor;
  const charges = s.lines.filter((l) => l.kind !== 'TAX');
  const body = `<div class="meta">
${student(t('document.billedTo'), s.student)}
${meta(t('document.issued'), d(view.issueDate))}
${meta(t('document.due'), d(view.dueDate))}
</div>
<table><thead><tr><th>${esc(t('document.item'))}</th><th class="num">${esc(t('document.quantity'))}</th><th class="num">${esc(t('document.amount'))}</th></tr></thead><tbody>
${charges
  .map(
    (l) =>
      `<tr><td>${esc(l.label)}</td><td class="num">${l.kind === 'CHARGE' ? esc(String(l.quantity)) : ''}</td><td class="num">${esc(m(l.amountMinor, currency))}</td></tr>`,
  )
  .join('')}</tbody></table>
<table class="totals"><tbody>
${row(t('document.subtotal'), m(totals.subtotalMinor, currency))}
${totals.discountMinor ? row(t('document.discount'), m(-totals.discountMinor, currency)) : ''}
${totals.taxMinor && s.tax?.mode !== 'INCLUSIVE' ? row(t('document.tax', { rate, label: s.tax?.label ?? 'GST' }), m(totals.taxMinor, currency)) : ''}
${row(t('document.total'), m(totals.totalMinor, currency), true)}
${view.creditAppliedMinor ? row(t('document.creditApplied'), m(-view.creditAppliedMinor, currency)) : ''}
${row(t('document.balance'), m(balance, currency), true)}
</tbody></table>
${totals.taxMinor && s.tax?.mode === 'INCLUSIVE' ? `<p class="note">${esc(t('document.taxIncluded', { amount: m(totals.taxMinor, currency), rate, label: s.tax?.label ?? 'GST' }))}</p>` : ''}
${
  s.payTo?.upi || s.payTo?.bank
    ? `<div><div class="label">${esc(t('document.payTo'))}</div>
${s.payTo.upi ? `<div>${esc(t('document.upi', { vpa: s.payTo.upi.vpa, payee: s.payTo.upi.payeeName }))}</div>` : ''}
${s.payTo.bank ? `<div>${esc(t('document.bank', s.payTo.bank))}</div>` : ''}
</div>`
    : ''
}
<p class="note">${esc(t('document.balanceNote'))}</p>`;
  return shell(
    view,
    layout,
    assets,
    t('document.invoiceTitle'),
    s.tax?.gstin ?? null,
    s.tax?.gstin ? t('document.gstin', { gstin: s.tax.gstin }) : null,
    body,
    locale,
  );
}

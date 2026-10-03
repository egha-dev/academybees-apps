import { Hex } from '@/components/bee-mark';
import { SiteFooter, SiteHeader } from '@/components/site-chrome';
import { CONTACT_EMAIL, earlyAccessHref, t } from '@/lib/site';

const TYPES = ['dance', 'music', 'sports', 'tuition', 'martial'] as const;
const FEATURES = [
  { key: 'attendance' },
  { key: 'fees' },
  { key: 'parents' },
  { key: 'address' },
  // Not built yet (multi-branch UI is deferred, OD-05; WhatsApp needs approved templates, G-07).
  { key: 'branches', later: true },
  { key: 'updates', later: true },
] as const;
const STEPS = ['setup', 'invite', 'run'] as const;
const FAQ = ['who', 'phone', 'app', 'payments', 'data', 'price', 'language'] as const;

export default function Home() {
  const mailto = earlyAccessHref();
  return (
    <>
      <SiteHeader home />
      <main id="main">
        <section className="hero wrap" aria-labelledby="hero-title">
          <p className="eyebrow">{t('hero.eyebrow')}</p>
          <h1 id="hero-title">{t('hero.title')}</h1>
          <p className="lead">{t('hero.body')}</p>
          <div className="actions">
            <a className="button" href="#early-access">
              {t('hero.cta')}
            </a>
            <a className="button button-secondary" href="#how">
              {t('hero.secondary')}
            </a>
          </div>
          <p className="muted">{t('hero.note')}</p>
          <div className="types">
            <span className="muted">{t('hero.types.label')}</span>
            <ul>
              {TYPES.map((k) => (
                <li key={k}>{t(`hero.types.${k}`)}</li>
              ))}
              <li className="plain">{t('hero.types.more')}</li>
            </ul>
          </div>
        </section>

        <section id="features" className="band" aria-labelledby="features-title">
          <div className="wrap">
            <h2 id="features-title">{t('features.title')}</h2>
            <p className="lead">{t('features.body')}</p>
            <ul className="grid">
              {FEATURES.map((f) => (
                <li key={f.key} className="card">
                  <Hex />
                  <h3>
                    {t(`features.items.${f.key}.title`)}
                    {'later' in f && <span className="tag">{t('features.later')}</span>}
                  </h3>
                  <p>{t(`features.items.${f.key}.body`)}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section id="how" className="wrap section" aria-labelledby="how-title">
          <h2 id="how-title">{t('how.title')}</h2>
          <ol className="steps">
            {STEPS.map((k, i) => (
              <li key={k}>
                <span className="step-number" aria-hidden>
                  {i + 1}
                </span>
                <div>
                  <h3>{t(`how.steps.${k}.title`)}</h3>
                  <p>{t(`how.steps.${k}.body`)}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section id="early-access" className="band" aria-labelledby="early-title">
          <div className="wrap early">
            <h2 id="early-title">{t('earlyAccess.title')}</h2>
            <p className="lead">{t('earlyAccess.body')}</p>
            <a className="button" href={mailto}>
              {t('earlyAccess.cta')}
            </a>
            <p className="muted">
              {t.rich('earlyAccess.note', {
                email: CONTACT_EMAIL,
                link: (chunks) => <a href={`mailto:${CONTACT_EMAIL}`}>{chunks}</a>,
              })}
            </p>
          </div>
        </section>

        <section id="faq" className="wrap section" aria-labelledby="faq-title">
          <h2 id="faq-title">{t('faq.title')}</h2>
          <div className="faq">
            {FAQ.map((k) => (
              <details key={k}>
                <summary>{t(`faq.items.${k}.q`)}</summary>
                <p>{t(`faq.items.${k}.a`)}</p>
              </details>
            ))}
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}

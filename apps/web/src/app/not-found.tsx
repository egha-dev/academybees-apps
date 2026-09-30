import { Container, EmptyState } from '@academybee/ui';
import { getTranslations } from 'next-intl/server';

export default async function NotFound() {
  const t = await getTranslations();
  return (
    <Container maxWidth="sm">
      <EmptyState
        title={t('shell.notFound.title')}
        body={t('shell.notFound.body')}
        action={{ label: t('common.actions.goHome'), href: '/' }}
      />
    </Container>
  );
}

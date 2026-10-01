import { EmptyState } from '@academybee/ui/components/feedback';
import { Container } from '@academybee/ui/components/layout';
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

'use client';

import { Button } from '@academybee/ui/components/actions';
import { useToast } from '@academybee/ui/components/feedback';
import { CopyIcon } from '@academybee/ui/icons';
import { useTranslations } from 'next-intl';

/** Copy the academy's address (UX v1.1 §3). */
export function CopyUrl({ url }: { url: string }) {
  const t = useTranslations('console.created');
  const toast = useToast();
  return (
    <Button
      variant="secondary"
      startIcon={<CopyIcon />}
      onClick={() => {
        navigator.clipboard.writeText(url).then(
          () => toast(t('copied')),
          () => toast(t('copyFailed')),
        );
      }}
    >
      {t('copy')}
    </Button>
  );
}

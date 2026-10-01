import { ThemeModeToggle } from '@academybee/ui/components/theme-toggle';
import { getTranslations } from 'next-intl/server';

/** Light / Dark / System switch (C-49); labels are translated on the server (no ICU runtime shipped). */
export async function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const t = await getTranslations('common.theme');
  return (
    <ThemeModeToggle
      compact={compact}
      labels={{ group: t('label'), light: t('light'), dark: t('dark'), system: t('system') }}
    />
  );
}

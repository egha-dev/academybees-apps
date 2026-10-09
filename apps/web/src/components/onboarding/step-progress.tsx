import { Box, Stack } from '@academybee/ui/components/layout';
import { Text } from '@academybee/ui/components/text';

/**
 * "Step 3 of 7 · First course" with a bar; status is spoken, never colour only (CLAUDE §10).
 */
export function StepProgress({
  current,
  total,
  label,
  name,
}: {
  current: number;
  total: number;
  label: string;
  name: string;
}) {
  return (
    <Stack spacing={1.5}>
      <Text variant="meta" tone="secondary">
        {label} · {name}
      </Text>
      <Box
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={current}
        aria-valuetext={label}
        sx={{ blockSize: 6, borderRadius: 3, bgcolor: 'ab.surfaceRaised', overflow: 'hidden' }}
      >
        <Box
          sx={{
            blockSize: '100%',
            inlineSize: `${Math.round((current / total) * 100)}%`,
            bgcolor: 'ab.accent',
            borderRadius: 3,
          }}
        />
      </Box>
    </Stack>
  );
}

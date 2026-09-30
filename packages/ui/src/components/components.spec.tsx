import { screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { AddIcon, HomeIcon, PeopleIcon } from '../icons.js';
import { expectAccessible, renderUi } from '../test/render.js';
import { Button, IconButton } from './actions.js';
import { Card, Skeleton, StatusBadge } from './display.js';
import { EmptyState, ErrorState, PermissionState, ToastProvider, useToast } from './feedback.js';
import { Select, TextField } from './inputs.js';
import { OfflineBanner, SyncIndicator } from './offline.js';
import { ConfirmDialog, Sheet } from './overlays.js';
import { AppShell } from './shell.js';

describe('Button / IconButton', () => {
  it('fires clicks, blocks them while loading, and is accessible', async () => {
    const onClick = vi.fn();
    const { container, rerender } = renderUi(<Button onClick={onClick}>Save</Button>);
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onClick).toHaveBeenCalledOnce();
    await expectAccessible(container);

    rerender(
      <Button onClick={onClick} loading>
        Save
      </Button>,
    );
    expect(screen.getByRole('button', { name: 'Save' }).hasAttribute('disabled')).toBe(true);
  });

  it('icon buttons carry an accessible name', async () => {
    const { container } = renderUi(
      <IconButton label="Add student">
        <AddIcon />
      </IconButton>,
    );
    expect(screen.getByRole('button', { name: 'Add student' })).toBeTruthy();
    await expectAccessible(container);
  });
});

describe('TextField / Select', () => {
  it('shows field-level errors linked to the input', async () => {
    const { container } = renderUi(
      <TextField
        label="Student name"
        value=""
        onChange={() => undefined}
        error="Enter a name"
        required
      />,
    );
    const input = screen.getByRole('textbox', { name: /Student name/ });
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(screen.getByText('Enter a name')).toBeTruthy();
    await expectAccessible(container);
  });

  it('reports typed values', async () => {
    const onChange = vi.fn();
    renderUi(<TextField label="Name" value="" onChange={onChange} />);
    await userEvent.type(screen.getByRole('textbox', { name: 'Name' }), 'ஆ');
    expect(onChange).toHaveBeenCalledWith('ஆ');
  });

  it('renders a labelled select', async () => {
    const { container } = renderUi(
      <Select
        label="Batch"
        value="a"
        options={[{ value: 'a', label: 'Morning' }]}
        onChange={() => undefined}
      />,
    );
    expect(screen.getByRole('combobox')).toBeTruthy();
    await expectAccessible(container);
  });
});

describe('StatusBadge', () => {
  it.each(['success', 'warning', 'danger', 'info', 'neutral'] as const)(
    '%s shows an icon and text, never colour only',
    async (tone) => {
      const { container } = renderUi(<StatusBadge tone={tone} label="Paid" />);
      expect(screen.getByText('Paid')).toBeTruthy();
      expect(container.querySelector('svg')).not.toBeNull();
      await expectAccessible(container);
    },
  );
});

describe('Card / Skeleton', () => {
  it('renders a titled card', async () => {
    const { container } = renderUi(<Card title="Today's classes" subtitle="3 classes" />);
    expect(screen.getByRole('heading', { name: "Today's classes" })).toBeTruthy();
    await expectAccessible(container);
  });

  it('announces loading', async () => {
    const { container } = renderUi(<Skeleton label="Loading students" />);
    expect(screen.getByRole('status', { name: 'Loading students' }).getAttribute('aria-busy')).toBe(
      'true',
    );
    await expectAccessible(container);
  });
});

describe('screen states', () => {
  it('EmptyState always offers the next action', async () => {
    const onClick = vi.fn();
    const { container } = renderUi(
      <EmptyState
        title="No students yet"
        body="Add your first student."
        action={{ label: 'Add student', onClick }}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Add student' }));
    expect(onClick).toHaveBeenCalled();
    await expectAccessible(container);
  });

  it('ErrorState explains, offers retry and shows a reference', async () => {
    const { container } = renderUi(
      <ErrorState
        title="Couldn't load"
        body="Try again."
        retry={{ label: 'Try again' }}
        reference="Reference: abc123"
      />,
    );
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
    expect(screen.getByText('Reference: abc123')).toBeTruthy();
    await expectAccessible(container);
  });

  it('PermissionState', async () => {
    const { container } = renderUi(
      <PermissionState title="No access" body="Ask your academy owner." />,
    );
    expect(screen.getByRole('heading', { name: 'No access' })).toBeTruthy();
    await expectAccessible(container);
  });
});

describe('Toast', () => {
  function Trigger() {
    const toast = useToast();
    return <Button onClick={() => toast('Attendance saved')}>Save</Button>;
  }

  it('announces confirmations politely', async () => {
    renderUi(
      <ToastProvider closeLabel="Close">
        <Trigger />
      </ToastProvider>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    const toast = await screen.findByText('Attendance saved');
    expect(toast.closest('[aria-live="polite"]')).not.toBeNull();
  });
});

describe('overlays', () => {
  it('ConfirmDialog states the consequence and confirms', async () => {
    const onConfirm = vi.fn();
    renderUi(
      <ConfirmDialog
        open
        title="Cancel this class?"
        body="Parents of 12 students will be told."
        confirmLabel="Cancel class"
        cancelLabel="Keep class"
        onConfirm={onConfirm}
        onCancel={() => undefined}
        tone="danger"
      />,
    );
    const dialog = screen.getByRole('dialog', { name: 'Cancel this class?' });
    expect(dialog.getAttribute('aria-describedby')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Cancel class' }));
    expect(onConfirm).toHaveBeenCalled();
    await expectAccessible(document.body);
  });

  it('Sheet has a labelled close button', async () => {
    const onClose = vi.fn();
    renderUi(
      <Sheet open onClose={onClose} title="Filters" closeLabel="Close filters">
        <p>content</p>
      </Sheet>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Close filters' }));
    expect(onClose).toHaveBeenCalled();
  });
});

describe('offline UI', () => {
  it('OfflineBanner is a live status', async () => {
    const { container } = renderUi(<OfflineBanner message="You're offline." />);
    expect(screen.getByRole('status').textContent).toContain("You're offline.");
    await expectAccessible(container);
  });

  it.each(['synced', 'offline', 'pending', 'syncing', 'attention'] as const)(
    'SyncIndicator %s shows icon + text',
    async (state) => {
      const { container } = renderUi(<SyncIndicator state={state} label="Label" detail="detail" />);
      expect(screen.getByRole('status').textContent).toContain('Label');
      expect(container.querySelector('svg')).not.toBeNull();
      await expectAccessible(container);
    },
  );
});

describe('AppShell', () => {
  const groups = [
    {
      key: 'run',
      label: 'Run',
      items: [
        { key: 'today', label: 'Today', icon: <HomeIcon />, href: '/today', active: true },
        { key: 'students', label: 'Students', icon: <PeopleIcon />, href: '/students' },
      ],
    },
  ];

  it('sidebar variant: navigation landmark with the current page marked', async () => {
    const { container } = renderUi(
      <AppShell
        brand={<span>Demo Academy</span>}
        navGroups={groups}
        navLabel="Main navigation"
        variant="sidebar"
      >
        <h1>Today</h1>
      </AppShell>,
    );
    const nav = screen.getByRole('navigation', { name: 'Main navigation' });
    expect(nav.querySelector('[aria-current="page"]')?.textContent).toContain('Today');
    expect(screen.getByRole('main')).toBeTruthy();
    await expectAccessible(container);
  });

  it('bottom-nav variant for phones', async () => {
    const { container } = renderUi(
      <AppShell
        brand={<span>Demo Academy</span>}
        navGroups={groups}
        bottomNav={groups[0]!.items}
        navLabel="Main navigation"
        variant="bottom-nav"
      >
        <h1>Today</h1>
      </AppShell>,
    );
    const nav = screen.getByRole('navigation', { name: 'Main navigation' });
    expect(nav.textContent).toContain('Students');
    await expectAccessible(container);
  });
});

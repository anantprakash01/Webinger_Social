/**
 * /settings — account settings (launch-readiness phase A): name, email, password, other devices,
 * download my data, delete my account (DPDP Act: access and erasure; FR-06).
 */
import { LanguageSwitcher } from '@/lib/i18n';
import { ThemeChoice } from '@/components/ThemeToggle';
import { NotificationPrefsCard } from '@/features/retention/components/Panels';
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { LuDownload, LuLogOut, LuTrash2 } from 'react-icons/lu';
import { api } from '@/api/client';
import { useAuth } from '@/app/AuthContext';
import { toast, useConfirm } from '@/components/feedback';
import { Badge, Button, Card, FormError, Input, PageHeader } from '@/components/ui';
import { PasswordField } from '@/features/auth/components/PasswordField';
import { ApiError } from '@/types';

const fieldError = (e: unknown, field: string) => (e instanceof ApiError ? e.fieldErrors.find((f) => f.field === field)?.message : undefined);
const longDate = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });

export function SettingsPage() {
  const { user } = useAuth();
  if (!user) return null;
  return (
    <div className="page settings" style={{ maxWidth: 760 }}>
      <PageHeader title="Account settings" />
      <NameCard name={user.name} />
      <EmailCard email={user.email} verified={user.emailVerified} />
      <Card title="Appearance">
        <div className="form-stack">
          <p className="small muted">Day or night mode on this device. “Match my device” follows your phone or computer setting.</p>
          <ThemeChoice />
        </div>
      </Card>
      <Card title="Language">
        <div className="form-stack">
          <p className="small muted">Hindi covers the menus, home page, sign-in and checkout so far; other screens stay in English for now.</p>
          <LanguageSwitcher className="lang-switch lang-switch--field" />
        </div>
      </Card>
      <NotificationPrefsCard role={user.role} />
      <PasswordCard />
      <DevicesCard />
      <DataCard />
      {user.role !== 'ADMIN' && <DeleteCard scheduledFor={user.deletionScheduledFor ?? null} />}
      <p className="small muted">
        How we use your data: <Link to="/privacy" className="link">Privacy notice</Link> · <Link to="/terms" className="link">Terms of use</Link>
      </p>
    </div>
  );
}

function NameCard({ name }: { name: string }) {
  const [value, setValue] = useState(name);
  const save = useMutation({ mutationFn: (n: string) => api.me.update({ name: n }), onSuccess: () => toast('Name saved') });
  return (
    <Card title="Your name">
      <form
        className="form-stack"
        onSubmit={(e) => {
          e.preventDefault();
          if (value.trim().length >= 2) save.mutate(value.trim());
        }}
      >
        <Input label="Name" value={value} onChange={(e) => setValue(e.target.value)} error={fieldError(save.error, 'name')} hint="Shown to the people you work with." />
        <div>
          <Button type="submit" variant="secondary" size="sm" loading={save.isPending} disabled={value.trim() === name || value.trim().length < 2}>
            Save name
          </Button>
        </div>
      </form>
    </Card>
  );
}

function EmailCard({ email, verified }: { email: string; verified: boolean }) {
  const [newEmail, setNewEmail] = useState('');
  const [password, setPassword] = useState('');
  const change = useMutation({
    mutationFn: () => api.me.changeEmail(newEmail.trim(), password),
    onSuccess: (me) => {
      setNewEmail('');
      setPassword('');
      toast(`Check ${me.email} for a link to confirm it`);
    },
  });
  return (
    <Card title="Email">
      <p className="small">
        {email} {verified ? <Badge tone="ok">Verified</Badge> : <Badge tone="warn">Not verified</Badge>}
      </p>
      <form
        className="form-stack"
        onSubmit={(e) => {
          e.preventDefault();
          change.mutate();
        }}
      >
        <div className="form-row">
          <Input label="New email" type="email" autoComplete="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} error={fieldError(change.error, 'newEmail')} />
          <PasswordField label="Current password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} error={fieldError(change.error, 'currentPassword')} />
        </div>
        <p className="small muted">We'll send a confirmation link to the new address. Until you confirm it, you can't place or accept orders.</p>
        <FormError>{change.error && !fieldError(change.error, 'newEmail') && !fieldError(change.error, 'currentPassword') ? change.error.message : null}</FormError>
        <div>
          <Button type="submit" variant="secondary" size="sm" loading={change.isPending} disabled={!newEmail.trim()}>
            Change email
          </Button>
        </div>
      </form>
    </Card>
  );
}

function PasswordCard() {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const change = useMutation({
    mutationFn: () => api.me.changePassword(current, next),
    onSuccess: () => {
      setCurrent('');
      setNext('');
      toast('Password changed. Other devices were signed out.');
    },
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    change.mutate();
  };
  return (
    <Card title="Password">
      <form className="form-stack" onSubmit={submit}>
        <div className="form-row">
          <PasswordField label="Current password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} error={fieldError(change.error, 'currentPassword')} />
          <PasswordField label="New password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} error={fieldError(change.error, 'newPassword')} rulesFor={next} />
        </div>
        <div>
          <Button type="submit" variant="secondary" size="sm" loading={change.isPending} disabled={!next}>
            Change password
          </Button>
        </div>
      </form>
    </Card>
  );
}

function DevicesCard() {
  const out = useMutation({
    mutationFn: () => api.me.signOutOtherDevices(),
    onSuccess: (r) => toast(r.signedOut ? `Signed out ${r.signedOut} other device${r.signedOut === 1 ? '' : 's'}` : 'No other devices were signed in'),
  });
  return (
    <Card title="Devices">
      <p className="small muted">Lost a phone, or signed in on a shared computer? End every other session. This device stays signed in.</p>
      <div>
        <Button variant="secondary" size="sm" loading={out.isPending} onClick={() => out.mutate()}>
          <LuLogOut aria-hidden /> Sign out other devices
        </Button>
      </div>
    </Card>
  );
}

function DataCard() {
  const dl = useMutation({
    mutationFn: () => api.me.exportData(),
    onSuccess: (data) => {
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `webinger-collab-data-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast('Your data was downloaded');
    },
  });
  return (
    <Card title="Your data">
      <p className="small muted">Download a copy of everything we hold about you: profile, orders, messages you sent, reviews, payouts and notifications.</p>
      <div>
        <Button variant="secondary" size="sm" loading={dl.isPending} onClick={() => dl.mutate()}>
          <LuDownload aria-hidden /> Download my data
        </Button>
      </div>
      <FormError>{dl.error?.message}</FormError>
    </Card>
  );
}

function DeleteCard({ scheduledFor }: { scheduledFor: string | null }) {
  const [password, setPassword] = useState('');
  const confirm = useConfirm();
  const del = useMutation({ mutationFn: (reason: string) => api.me.requestDeletion(password, reason || null), onSuccess: () => toast('Account deletion scheduled') });
  const undo = useMutation({ mutationFn: () => api.me.cancelDeletion(), onSuccess: () => toast('Account deletion cancelled') });

  if (scheduledFor) {
    return (
      <Card title="Delete account" className="settings__danger">
        <p className="small">
          <strong>Your account will be deleted on {longDate(scheduledFor)}.</strong> Until then you can sign in and change your mind.
        </p>
        <div>
          <Button size="sm" loading={undo.isPending} onClick={() => undo.mutate()}>
            Keep my account
          </Button>
        </div>
      </Card>
    );
  }
  return (
    <Card title="Delete account" className="settings__danger">
      <p className="small muted">
        Your profile, messages and personal details are erased 30 days after you ask; you can cancel until then. Invoices and payment records are kept as tax law requires, without
        your name. Open orders and any balance must be settled first.
      </p>
      <PasswordField label="Current password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} error={fieldError(del.error, 'currentPassword')} />
      <FormError>{del.error && !fieldError(del.error, 'currentPassword') ? del.error.message : null}</FormError>
      <div>
        <Button
          variant="ghost"
          size="sm"
          loading={del.isPending}
          onClick={async () => {
            const reason = await confirm.ask({ title: 'Delete your account?', body: 'It will be erased in 30 days unless you sign in and cancel.', confirmLabel: 'Delete my account', reasonLabel: 'Anything we could do better? (optional)', reasonMin: 0 });
            if (reason !== false) del.mutate(reason === 'yes' ? '' : reason);
          }}
        >
          <LuTrash2 aria-hidden /> Delete my account
        </Button>
      </div>
      {confirm.dialog}
    </Card>
  );
}

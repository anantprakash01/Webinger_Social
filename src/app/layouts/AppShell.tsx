/**
 * Logged-in layout, ported from the Webinger AppShell: sidebar on desktop, bottom nav (4 items +
 * More) under 900 px, and a demo bar with "View as" + "Reset demo data" in mock mode.
 */
import { useConfirm } from '@/components/feedback';
import { Suspense, useState } from 'react';
import { Navigate, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { LuBell, LuChevronDown, LuEllipsis, LuEye, LuLogOut, LuX } from 'react-icons/lu';
import { api, isMock } from '@/api/client';
import { DEMO_PASSWORD, demoAccounts } from '@/api/mock/demo';
import { Logo } from '@/components/Logo';
import { Avatar, Button, PageSkeleton, cx } from '@/components/ui';
import { VerifyEmailBanner } from '@/features/auth/components/VerifyEmailGate';
import { VettingBanner } from '@/features/creators/components/VettingBanner';
import { useDemoVettingDecision } from '@/features/creators/workspaceHooks';
import { useDemoClock, useSimulateTime } from '@/features/orders/hooks';
import { useRealtimeSync, useUnreadCounts } from '@/features/chat/hooks';
import { useAdminSummary } from '@/features/admin/hooks';
import { ROLE_LABEL } from '@/types';
import { homePath, useAuth } from '../AuthContext';
import { AREA_TITLE, NAV } from '../nav';
import './shell.css';

export function AppShell() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  // The "More" sheet belongs to the page it was opened on, so navigating closes it.
  const [moreOpenOn, setMoreOpenOn] = useState<string | null>(null);
  const moreOpen = moreOpenOn === location.pathname;
  const setMoreOpen = (open: boolean) => setMoreOpenOn(open ? location.pathname : null);
  // Week 5: unread badges, kept fresh by the real-time feed (STOMP, or the mock's poller).
  const unread = useUnreadCounts();
  // Week 6: admin queues show how many items wait in vetting, disputes and reports.
  const summary = useAdminSummary().data;
  const counts = { ...unread, vetting: summary?.pendingVetting ?? 0, disputes: summary?.openDisputes ?? 0, reports: summary?.openReports ?? 0 };
  useRealtimeSync(!!user);

  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  const items = NAV[user.role];
  const primary = items.filter((i) => i.primary).slice(0, 4);
  const hasMore = items.length > primary.length;
  const subtitle = user.role === 'BRAND' ? (user.brand?.companyName ?? 'Brand') : ROLE_LABEL[user.role];

  const signOut = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className="shell">
      <a href="#content" className="skip-link">
        Skip to content
      </a>
      <aside className="sidebar" aria-label="Main navigation">
        <div className="sidebar__brand">
          <div className="sidebar__brand-row">
            <Logo height={24} />
            <Bell count={counts.notifications} />
          </div>
          <div className="sidebar__area">{AREA_TITLE[user.role]}</div>
        </div>
        <nav className="sidebar__nav">
          {items.map(({ to, label, icon: Icon, badge }) => (
            <NavLink key={to} to={to} className="navlink">
              <Icon size={18} aria-hidden /> {label}
              {badge && <CountBadge n={counts[badge]} />}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar__foot">
          <div className="me">
            <Avatar name={user.name} />
            <div style={{ minWidth: 0 }}>
              <div className="me__name">{user.name}</div>
              <div className="me__role">{subtitle}</div>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={() => void signOut()}>
            <LuLogOut aria-hidden /> Sign out
          </Button>
        </div>
      </aside>

      <div className="main">
        {isMock && <DemoBar />}
        <header className="topbar">
          <Logo height={20} />
          <span className="spacer" />
          <Bell count={counts.notifications} />
          <Avatar name={user.name} size={32} />
        </header>
        {user.impersonatedBy && <ImpersonationBanner name={user.name} admin={user.impersonatedBy} />}
        <VerifyEmailBanner />
        {user.role === 'CREATOR' && user.creator && !location.pathname.startsWith('/creator/onboarding') && !location.pathname.startsWith('/creator/dashboard') && (
          <div className="shell-banner">
            <VettingBanner status={user.creator.vettingStatus} reason={user.creator.rejectionReason} />
          </div>
        )}
        <main id="content" tabIndex={-1}>
          <Suspense fallback={<PageSkeleton />}>
            <Outlet />
          </Suspense>
        </main>
      </div>

      <nav className="bottomnav" aria-label="Main navigation">
        {primary.map(({ to, label, icon: Icon, badge }) => (
          <NavLink key={to} to={to}>
            <span className="bottomnav__icon">
              <Icon size={22} aria-hidden />
              {badge && <CountBadge n={counts[badge]} dot />}
            </span>
            {label}
          </NavLink>
        ))}
        {hasMore && (
          <button type="button" onClick={() => setMoreOpen(true)} aria-haspopup="dialog">
            <span className="bottomnav__icon">
              <LuEllipsis size={22} aria-hidden />
              <CountBadge n={items.filter((i) => !i.primary && i.badge).reduce((s, i) => s + counts[i.badge!], 0)} dot />
            </span>
            More
          </button>
        )}
      </nav>

      {moreOpen && (
        <>
          <div className="sheet-backdrop" onClick={() => setMoreOpen(false)} />
          <div className="sheet" role="dialog" aria-modal="true" aria-label="More pages">
            <div className="row" style={{ marginBottom: 8 }}>
              <strong>{AREA_TITLE[user.role]}</strong>
              <span className="spacer" />
              <Button variant="ghost" icon onClick={() => setMoreOpen(false)} aria-label="Close">
                <LuX size={20} />
              </Button>
            </div>
            {items.map(({ to, label, icon: Icon, badge }) => (
              <NavLink key={to} to={to} className="navlink">
                <Icon size={18} aria-hidden /> {label}
                {badge && <CountBadge n={counts[badge]} />}
              </NavLink>
            ))}
            <Button variant="secondary" onClick={() => void signOut()} style={{ marginTop: 12 }}>
              <LuLogOut aria-hidden /> Sign out
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

/** Mock-only controls (section 9.5 rule 6): switch demo account, reset demo data. */
function DemoBar() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const confirm = useConfirm();
  const [open, setOpen] = useState(false);
  if (!user) return null;
  const known = demoAccounts.some((a) => a.email === user.email);

  const switchTo = async (email: string) => {
    setError(null);
    try {
      const u = await api.auth.login(email, DEMO_PASSWORD);
      navigate(homePath(u), { replace: true });
    } catch (e) {
      // e.g. the demo password was changed through "forgot password" during the demo.
      setError(e instanceof Error ? e.message : 'Could not switch account.');
    }
  };

  const reset = async () => {
    if (!(await confirm.ask({ title: 'Reset all demo data?', body: 'Every change made in this tab is lost and the demo starts again from its original data.', confirmLabel: 'Reset demo data' }))) return;
    await api.dev.reset();
    navigate('/login', { replace: true, state: { notice: 'Demo data was reset.' } });
  };

  return (
    <div className="demo-bar" role="note">
      <strong>Prototype</strong>
      <span className="demo-bar__text">Demo data only, kept in this browser tab.</span>
      {error && (
        <span role="alert" className="demo-bar__error">
          {error}
        </span>
      )}
      <span className="spacer" />
      {/* Phones: one compact toggle instead of three rows of controls (UX pass, item 14). */}
      <button type="button" className="demo-bar__btn demo-bar__toggle" aria-expanded={open} aria-controls="demo-controls" onClick={() => setOpen((v) => !v)}>
        Demo controls <LuChevronDown aria-hidden className={open ? 'is-flipped' : undefined} />
      </button>
      <div className={cx('demo-bar__controls', open && 'is-open')} id="demo-controls">
      <label htmlFor="view-as">View as</label>
      <select id="view-as" value={known ? user.email : ''} onChange={(e) => void switchTo(e.target.value)}>
        {!known && <option value="">{user.email}</option>}
        {demoAccounts.map((a) => (
          <option key={a.email} value={a.email}>
            {ROLE_LABEL[a.role]} · {a.note}
          </option>
        ))}
      </select>
      <DemoClock />
      {user.role === 'CREATOR' && user.creator?.vettingStatus === 'PENDING_REVIEW' && <DemoVetting />}
      <button type="button" className="demo-bar__btn" onClick={() => void reset()}>
        Reset demo data
      </button>
      </div>
      {confirm.dialog}
    </div>
  );
}

/**
 * Mock-only shortcut to the admin vetting queue (FR-80): lets a reviewer see a profile in review
 * get approved or rejected without switching accounts.
 */
function DemoVetting() {
  const decide = useDemoVettingDecision();
  const confirm = useConfirm();
  const reject = async () => {
    const reason = await confirm.ask({ title: 'Simulate a rejection', confirmLabel: 'Reject profile', reasonLabel: 'Reason shown to the creator', reasonDefault: 'Please add a clearer profile photo.', reasonMin: 10 });
    if (reason) decide.mutate({ decision: 'REJECT', reason });
  };
  return (
    <span className="demo-bar__group" role="group" aria-label="Simulate review">
      <span>Simulate review:</span>
      <button type="button" className="demo-bar__btn" disabled={decide.isPending} onClick={() => decide.mutate({ decision: 'APPROVE' })}>
        Approve
      </button>
      <button type="button" className="demo-bar__btn" disabled={decide.isPending} onClick={() => void reject()}>
        Reject
      </button>
      {confirm.dialog}
    </span>
  );
}

/**
 * Mock-only "Simulate time" (section 4.3): moves the demo clock forward and runs the expiry and
 * auto-approve jobs at once, so reviewers can see FR-32 / FR-36 without waiting 72 hours.
 */
function DemoClock() {
  const clock = useDemoClock(true);
  const sim = useSimulateTime();
  const offset = sim.data?.offsetHours ?? clock.data?.offsetHours ?? 0;
  const result = sim.data ? `${sim.data.expired} expired, ${sim.data.autoApproved} auto-approved` : null;
  return (
    <span className="demo-bar__group" role="group" aria-label="Demo clock">
      <label htmlFor="sim-time">Simulate time</label>
      <select
        id="sim-time"
        value=""
        disabled={sim.isPending}
        onChange={(e) => {
          const h = Number(e.target.value);
          if (h) sim.mutate(h);
        }}
      >
        <option value="">{offset ? `Clock +${offset} h` : 'Now'}</option>
        <option value="24">+24 hours</option>
        <option value="73">+73 hours</option>
        <option value="168">+7 days</option>
      </select>
      {result && (
        <span role="status" className="demo-bar__note">
          {result}
        </span>
      )}
    </span>
  );
}

/**
 * FR-82: shown while an admin views the app as another user. Every change is refused by the API
 * (403 READ_ONLY_IMPERSONATION); "Stop viewing" restores the admin's own session.
 */
function ImpersonationBanner({ name, admin }: { name: string; admin: string }) {
  const navigate = useNavigate();
  return (
    <div className="impersonation" role="status">
      <LuEye aria-hidden />
      <span>
        <strong>Viewing as {name}</strong> (read-only) — signed in as {admin}.
      </span>
      <span className="spacer" />
      <button
        type="button"
        className="btn btn--secondary btn--sm"
        onClick={async () => {
          await api.auth.stopImpersonating();
          navigate('/admin/users', { replace: true });
        }}
      >
        Stop viewing
      </button>
    </div>
  );
}

/** Unread count next to a nav item; `dot` = compact version on the phone bottom bar. */
function CountBadge({ n, dot }: { n: number; dot?: boolean }) {
  if (n <= 0) return null;
  return (
    <span className={dot ? 'count-badge count-badge--dot' : 'count-badge'}>
      <span aria-hidden>{n > 99 ? '99+' : n}</span>
      <span className="sr-only">, {n} unread</span>
    </span>
  );
}

/** FR-52 bell: opens the inbox, shows the unread count. */
function Bell({ count }: { count: number }) {
  return (
    <NavLink to="/notifications" className="bell" aria-label={count ? `Notifications, ${count} unread` : 'Notifications'}>
      <LuBell size={20} aria-hidden />
      {count > 0 && (
        <span className="bell__count" aria-hidden>
          {count > 99 ? '99+' : count}
        </span>
      )}
    </NavLink>
  );
}

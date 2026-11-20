/**
 * Logged-in layout, ported from the Webinger AppShell: sidebar on desktop, bottom nav (4 items +
 * More) under 900 px, and a demo bar with "View as" + "Reset demo data" in mock mode.
 */
import { Suspense, useState } from 'react';
import { Navigate, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { LuEllipsis, LuLogOut, LuX } from 'react-icons/lu';
import { api, isMock } from '@/api/client';
import { DEMO_PASSWORD, demoAccounts } from '@/api/mock/demo';
import { Logo } from '@/components/Logo';
import { Avatar, Button, PageSkeleton } from '@/components/ui';
import { VerifyEmailBanner } from '@/features/auth/components/VerifyEmailGate';
import { VettingBanner } from '@/features/creators/components/VettingBanner';
import { useDemoVettingDecision } from '@/features/creators/workspaceHooks';
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
          <Logo height={24} />
          <div className="sidebar__area">{AREA_TITLE[user.role]}</div>
        </div>
        <nav className="sidebar__nav">
          {items.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} className="navlink">
              <Icon size={18} aria-hidden /> {label}
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
          <Avatar name={user.name} size={32} />
        </header>
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
        {primary.map(({ to, label, icon: Icon }) => (
          <NavLink key={to} to={to}>
            <Icon size={22} aria-hidden />
            {label}
          </NavLink>
        ))}
        {hasMore && (
          <button type="button" onClick={() => setMoreOpen(true)} aria-haspopup="dialog">
            <LuEllipsis size={22} aria-hidden />
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
            {items.map(({ to, label, icon: Icon }) => (
              <NavLink key={to} to={to} className="navlink">
                <Icon size={18} aria-hidden /> {label}
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
    if (!window.confirm('Reset all demo data? Every change made in this tab is lost.')) return;
    await api.dev.reset();
    navigate('/login', { replace: true, state: { notice: 'Demo data was reset.' } });
  };

  return (
    <div className="demo-bar" role="note">
      <strong>Prototype</strong>
      <span>Demo data only, kept in this browser tab.</span>
      {error && (
        <span role="alert" className="demo-bar__error">
          {error}
        </span>
      )}
      <span className="spacer" />
      <label htmlFor="view-as">View as</label>
      <select id="view-as" value={known ? user.email : ''} onChange={(e) => void switchTo(e.target.value)}>
        {!known && <option value="">{user.email}</option>}
        {demoAccounts.map((a) => (
          <option key={a.email} value={a.email}>
            {ROLE_LABEL[a.role]} · {a.note}
          </option>
        ))}
      </select>
      {user.role === 'CREATOR' && user.creator?.vettingStatus === 'PENDING_REVIEW' && <DemoVetting />}
      <button type="button" className="demo-bar__btn" onClick={() => void reset()}>
        Reset demo data
      </button>
    </div>
  );
}

/**
 * Mock-only stand-in for the admin vetting queue (FR-80 arrives in Week 6): lets a reviewer see
 * a profile in review get approved or rejected without switching accounts.
 */
function DemoVetting() {
  const decide = useDemoVettingDecision();
  const reject = () => {
    const reason = window.prompt('Reason shown to the creator:', 'Please add a clearer profile photo.');
    if (reason?.trim()) decide.mutate({ decision: 'REJECT', reason: reason.trim() });
  };
  return (
    <span className="demo-bar__group" role="group" aria-label="Simulate review">
      <span>Simulate review:</span>
      <button type="button" className="demo-bar__btn" disabled={decide.isPending} onClick={() => decide.mutate({ decision: 'APPROVE' })}>
        Approve
      </button>
      <button type="button" className="demo-bar__btn" disabled={decide.isPending} onClick={reject}>
        Reject
      </button>
    </span>
  );
}

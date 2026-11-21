/**
 * Account menu (v2.1): the avatar shows the user's photo (creator), logo (brand) or initials, and opens a
 * small menu with name and email, Change photo, the profile and money pages for the role, and Sign out.
 * Sidebar on desktop (opens upwards), top bar on phones (opens downwards).
 */
import { useEffect, useId, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { LuCamera, LuCreditCard, LuExternalLink, LuLogOut, LuUserRound, LuWallet, LuBuilding2 } from 'react-icons/lu';
import { useMutation } from '@tanstack/react-query';
import { api } from '@/api/client';
import { toast } from '@/components/feedback';
import { Avatar, Drawer, FormError, cx } from '@/components/ui';
import { ImagePicker } from '@/features/files/components/ImagePicker';
import { ROLE_LABEL, type Me } from '@/types';

export function AccountMenu({ user, onSignOut, placement, showName }: { user: Me; onSignOut: () => void; placement: 'up' | 'down'; showName?: boolean }) {
  const [changing, setChanging] = useState(false);
  const menuId = useId();
  const wrap = useRef<HTMLDivElement>(null);
  const { pathname } = useLocation();
  // The menu belongs to the page it was opened on, so navigating closes it.
  const [openOn, setOpenOn] = useState<string | null>(null);
  const open = openOn === pathname;
  const setOpen = (v: boolean | ((was: boolean) => boolean)) => setOpenOn((typeof v === 'function' ? v(open) : v) ? pathname : null);
  const readOnly = !!user.impersonatedBy;

  // Close on outside click and Escape.
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e: MouseEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        wrap.current?.querySelector<HTMLButtonElement>('.account__trigger')?.focus();
      }
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const subtitle = user.role === 'BRAND' ? (user.brand?.companyName ?? 'Brand') : ROLE_LABEL[user.role];
  const isCreator = user.role === 'CREATOR';
  const live = isCreator && user.creator?.vettingStatus === 'APPROVED' && user.creator.username;
  const photoWord = user.role === 'BRAND' ? 'logo' : 'photo';

  return (
    <div className={cx('account', `account--${placement}`)} ref={wrap}>
      <button type="button" className={cx('account__trigger', showName && 'account__trigger--full')} aria-expanded={open} aria-controls={menuId} onClick={() => setOpen((v) => !v)}>
        <Avatar name={user.name} src={user.avatarUrl ?? null} size={showName ? 36 : 32} />
        {showName ? (
          <span className="account__who">
            <span className="me__name">{user.name}</span>
            <span className="me__role">{subtitle}</span>
          </span>
        ) : (
          <span className="sr-only">Account menu for {user.name}</span>
        )}
      </button>
      {open && (
        <div className="account__menu" id={menuId}>
          <div className="account__head">
            <span className="account__photo">
              <Avatar name={user.name} src={user.avatarUrl ?? null} size={44} />
              {!readOnly && (
                <button type="button" className="account__photo-edit" onClick={() => setChanging(true)} tabIndex={-1} aria-hidden title={`Change ${photoWord}`}>
                  <LuCamera aria-hidden />
                </button>
              )}
            </span>
            <span style={{ minWidth: 0 }}>
              <span className="account__name">{user.name}</span>
              <span className="account__email">{user.email}</span>
            </span>
          </div>
          <ul className="account__list">
            {!readOnly && (
              <li>
                <button type="button" onClick={() => setChanging(true)}>
                  <LuCamera aria-hidden /> Change {photoWord}
                </button>
              </li>
            )}
            {live && (
              <li>
                <Link to={`/u/${user.creator!.username}`}>
                  <LuExternalLink aria-hidden /> View public profile
                </Link>
              </li>
            )}
            {isCreator && (
              <>
                <li>
                  <Link to="/creator/onboarding?step=profile">
                    <LuUserRound aria-hidden /> Edit profile
                  </Link>
                </li>
                <li>
                  <Link to="/creator/payouts">
                    <LuWallet aria-hidden /> Payouts
                  </Link>
                </li>
              </>
            )}
            {user.role === 'BRAND' && (
              <>
                <li>
                  <Link to="/brand/profile">
                    <LuBuilding2 aria-hidden /> Company profile
                  </Link>
                </li>
                <li>
                  <Link to="/brand/payment-methods">
                    <LuCreditCard aria-hidden /> Payment methods
                  </Link>
                </li>
              </>
            )}
            <li className="account__sep">
              <button type="button" onClick={onSignOut}>
                <LuLogOut aria-hidden /> Sign out
              </button>
            </li>
          </ul>
        </div>
      )}
      <Drawer open={changing} onClose={() => setChanging(false)} title={`Change your ${photoWord}`}>
        {changing && <ChangePhoto user={user} onDone={() => setChanging(false)} />}
      </Drawer>
    </div>
  );
}

function ChangePhoto({ user, onDone }: { user: Me; onDone: () => void }) {
  const save = useMutation({ mutationFn: (url: string | null) => api.me.updateAvatar(url) });
  const brand = user.role === 'BRAND';
  return (
    <div className="form-stack">
      <p className="small muted">
        {user.role === 'CREATOR'
          ? 'Shown on your public profile, in search and to brands. A clear, friendly photo works best.'
          : brand
            ? 'Shown to creators on your orders, campaigns and messages.'
            : 'Shown in your account menu.'}
      </p>
      <ImagePicker
        label={brand ? 'Company logo' : 'Photo'}
        purpose={brand ? 'BRAND_LOGO' : 'AVATAR'}
        shape="circle"
        value={user.avatarUrl ?? null}
        disabled={save.isPending}
        onChange={(url) => {
          // Creators need a photo for review, so "remove" is refused by the API; say so instead of failing quietly.
          save.mutate(url, {
            onSuccess: () => {
              toast(url ? `${brand ? 'Logo' : 'Photo'} updated` : `${brand ? 'Logo' : 'Photo'} removed`);
              onDone();
            },
          });
        }}
      />
      <FormError>{save.error?.message}</FormError>
    </div>
  );
}

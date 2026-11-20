/** Small building blocks shared by creator cards, profiles and (later) dashboards. */
import { FaInstagram, FaTiktok, FaYoutube } from 'react-icons/fa6';
import { LuBadgeCheck, LuClapperboard, LuStar } from 'react-icons/lu';
import { COUNTRY_LABEL, PLATFORM_LABEL } from '@/lib/catalog';
import type { Platform } from '@/types';
import { cx } from './ui';

const PLATFORM_ICON = { INSTAGRAM: FaInstagram, TIKTOK: FaTiktok, YOUTUBE: FaYoutube, UGC: LuClapperboard } as const;

export function PlatformIcon({ platform, size = 16 }: { platform: Platform; size?: number }) {
  const Icon = PLATFORM_ICON[platform];
  return <Icon size={size} aria-hidden className="platform-icon" />;
}

/** Icon + name, e.g. for package headers. */
export function PlatformLabel({ platform }: { platform: Platform }) {
  return (
    <span className="platform-label">
      <PlatformIcon platform={platform} /> {PLATFORM_LABEL[platform]}
    </span>
  );
}

/** Deterministic hue from a string, for photo fallbacks. */
function hueOf(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h % 360;
}

/** Profile photo, or initials on a colour derived from the username when there is none. */
export function CreatorPhoto({ name, url, seed, size, className }: { name: string; url: string | null; seed: string; size?: number; className?: string }) {
  const style = size ? { width: size, height: size } : undefined;
  if (url) return <img src={url} alt="" className={cx('creator-photo', className)} style={style} loading="lazy" decoding="async" />;
  const initials = name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('');
  const hue = hueOf(seed);
  return (
    <span
      className={cx('creator-photo creator-photo--initials', className)}
      style={{ ...style, background: `linear-gradient(135deg, hsl(${hue} 45% 28%), hsl(${(hue + 40) % 360} 55% 42%))`, fontSize: size ? size * 0.36 : undefined }}
      aria-hidden
    >
      {initials}
    </span>
  );
}

export function VerifiedBadge({ withText }: { withText?: boolean }) {
  return (
    <span className="verified" title="Social accounts verified by our team">
      <LuBadgeCheck aria-hidden />
      {withText ? <span>Verified</span> : <span className="sr-only">Verified</span>}
    </span>
  );
}

/** "★ 4.8 (23)" or "New" when there are no reviews. */
export function Rating({ avg, count }: { avg: number | null; count: number }) {
  if (avg === null || count === 0) return <span className="rating rating--new">New</span>;
  const label = `Rated ${avg.toFixed(1)} out of 5 from ${count} review${count === 1 ? '' : 's'}`;
  return (
    <span className="rating" role="img" aria-label={label} title={label}>
      <LuStar aria-hidden className="rating__star" />
      <strong aria-hidden>{avg.toFixed(1)}</strong>
      <span className="muted" aria-hidden>
        ({count})
      </span>
    </span>
  );
}

/** Five stars for a single review. */
export function Stars({ value }: { value: number }) {
  return (
    <span className="stars" role="img" aria-label={`${value} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <LuStar key={i} aria-hidden className={cx('stars__star', i <= value && 'is-on')} />
      ))}
    </span>
  );
}

export const placeLabel = (city: string | null, country: string | null) =>
  [city, country ? (COUNTRY_LABEL[country] ?? country) : null].filter(Boolean).join(', ');

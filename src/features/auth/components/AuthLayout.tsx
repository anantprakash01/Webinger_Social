import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Logo, PRODUCT_NAME } from '@/components/Logo';
import '@/app/layouts/shell.css';

/** Split screen used by every signed-out auth page (same as the Webinger login). */
export function AuthLayout({ title, tagline, children }: { title?: string; tagline?: string; children: ReactNode }) {
  return (
    <div className="auth">
      <section className="auth__panel">
        <Link to="/" aria-label={`${PRODUCT_NAME} home`} style={{ textDecoration: 'none', alignSelf: 'flex-start' }}>
          <Logo height={30} inverse />
        </Link>
        <div>
          <h1>{title ?? 'Creators, booked and paid safely.'}</h1>
          <p className="auth__tag">
            {tagline ?? 'Brands find vetted creators with prices up front. Payment waits in escrow until the work is approved.'}
          </p>
        </div>
        <span className="auth__dot" aria-hidden />
      </section>
      <main className="auth__form-wrap">{children}</main>
    </div>
  );
}

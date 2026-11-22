/** Public pages (landing, search, profile): top header with logo, Search, Log in, Join as creator; footer. */
import { LanguageSwitcher, useT } from '@/lib/i18n';
import { ThemeToggle } from '@/components/ThemeToggle';
import { Suspense } from 'react';
import { Link, NavLink, Outlet } from 'react-router-dom';
import { LuSearch } from 'react-icons/lu';
import { Logo, PRODUCT_NAME } from '@/components/Logo';
import { PageSkeleton } from '@/components/ui';
import { homePath, useAuth } from '../AuthContext';

export function PublicLayout() {
  const { t } = useT();
  const { user } = useAuth();
  return (
    <div className="public">
      <a href="#content" className="skip-link">
        {t('Skip to content')}
      </a>
      <header className="public-header">
        <Link to="/" className="public-header__logo" aria-label={`${PRODUCT_NAME} home`}>
          <Logo height={22} />
        </Link>
        <nav className="public-nav" aria-label="Site">
          <ThemeToggle />
          <LanguageSwitcher className="lang-switch lang-switch--header" />
          <NavLink to="/search" className="public-nav__link">
            <LuSearch aria-hidden /> <span className="public-nav__text">{t('Search')}</span>
          </NavLink>
          {user ? (
            <Link to={homePath(user)} className="btn btn--primary btn--sm">
              {t('My workspace')}
            </Link>
          ) : (
            <>
              <NavLink to="/login" className="public-nav__link">
                {t('Log in')}
              </NavLink>
              {/* Brands are the paying side, so they get their own entry point (UX pass, item 18). */}
              <Link to="/signup?role=brand" className="btn btn--secondary btn--sm public-nav__brands">
                {t('Hire creators')}
              </Link>
              <Link to="/signup?role=creator" className="btn btn--primary btn--sm public-nav__creators">
                {t('Join as creator')}
              </Link>
              {/* Phones: one button; the sign-up page asks brand or creator. */}
              <Link to="/signup" className="btn btn--primary btn--sm public-nav__join">
                {t('Join')}
              </Link>
            </>
          )}
        </nav>
      </header>

      <main id="content" className="public-main" tabIndex={-1}>
        <Suspense fallback={<PageSkeleton />}>
          <Outlet />
        </Suspense>
      </main>

      <footer className="public-footer">
        <div className="public-footer__cols">
          <div>
            <Logo height={20} inverse />
            <p style={{ marginTop: 12, maxWidth: '32ch' }}>{t('Book social media creators with prices up front and payment held in escrow.')}</p>
          </div>
          <div>
            <h2>{t('For brands')}</h2>
            <ul>
              <li><Link to="/search">{t('Find creators')}</Link></li>
              <li><Link to="/signup?role=brand">{t('Create a brand account')}</Link></li>
            </ul>
          </div>
          <div>
            <h2>{t('For creators')}</h2>
            <ul>
              <li><Link to="/signup?role=creator">{t('Join as a creator')}</Link></li>
              <li><Link to="/login">{t('Log in')}</Link></li>
            </ul>
          </div>
          <div>
            <h2>{t('Company')}</h2>
            <ul>
              <li><Link to="/terms">{t('Terms of use')}</Link></li>
              <li><Link to="/privacy">{t('Privacy notice')}</Link></li>
              <li><Link to="/refunds">{t('Refunds & cancellations')}</Link></li>
            </ul>
          </div>
        </div>
        <LanguageSwitcher className="lang-switch lang-switch--footer" />
        <div className="public-footer__legal">© {new Date().getFullYear()} {PRODUCT_NAME}. {t('Prototype — all creators and brands shown are invented.')}</div>
      </footer>
    </div>
  );
}

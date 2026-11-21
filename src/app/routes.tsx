/**
 * Routes (CLAUDE.md §9.3). Each area is its own lazy bundle, so a creator never downloads the
 * admin console and a visitor downloads neither.
 */
import { lazy } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { ForgotPasswordPage } from '@/features/auth/pages/ForgotPasswordPage';
import { LoginPage } from '@/features/auth/pages/LoginPage';
import { ResetPasswordPage } from '@/features/auth/pages/ResetPasswordPage';
import { SignupPage } from '@/features/auth/pages/SignupPage';
import { VerifyEmailPage } from '@/features/auth/pages/VerifyEmailPage';
import { isMock } from '@/api/client';
import { GuestOnly, RequireRole } from './guards';
import { AppShell } from './layouts/AppShell';
import { PublicLayout } from './layouts/PublicLayout';
import { NotFound } from './pages/Placeholder';

const area = <M extends Record<string, unknown>>(load: () => Promise<M>, name: keyof M & string) =>
  lazy(() => load().then((m) => ({ default: m[name] as React.ComponentType })));

const brand = () => import('./pages/brand');
const creator = () => import('./pages/creator');
const admin = () => import('./pages/admin');
const shared = () => import('./pages/shared');

const LandingPage = area(() => import('@/features/landing/pages/LandingPage'), 'LandingPage');
const SearchPage = area(() => import('@/features/search/pages/SearchPage'), 'SearchPage');
const CreatorProfilePage = area(() => import('@/features/creators/pages/CreatorProfilePage'), 'CreatorProfilePage');

const BrandDashboard = area(brand, 'BrandDashboard');
const OrdersListPage = area(() => import('@/features/orders/pages/OrdersListPage'), 'OrdersListPage');
const OrderDetailPage = area(() => import('@/features/orders/pages/OrderDetailPage'), 'OrderDetailPage');
const BrandCampaigns = area(brand, 'BrandCampaigns');
const BrandCampaignDetail = area(brand, 'BrandCampaignDetail');
const BrandProfile = area(() => import('@/features/brands/pages/BrandProfilePage'), 'BrandProfilePage');
const CheckoutPage = area(() => import('@/features/orders/pages/CheckoutPage'), 'CheckoutPage');

const CreatorOnboarding = area(() => import('@/features/creators/pages/OnboardingPage'), 'OnboardingPage');
const CreatorDashboard = area(() => import('@/features/creators/pages/CreatorDashboardPage'), 'CreatorDashboardPage');
const CreatorCampaigns = area(creator, 'CreatorCampaigns');
const CreatorPackages = area(() => import('@/features/creators/pages/PackagesPage'), 'PackagesPage');
const MockStripeConnectPage = area(() => import('@/features/payouts/pages/MockStripeConnectPage'), 'MockStripeConnectPage');
const CreatorPayouts = area(creator, 'CreatorPayouts');

const AdminVetting = area(admin, 'AdminVetting');
const AdminDisputes = area(admin, 'AdminDisputes');
const AdminUsers = area(admin, 'AdminUsers');
const AdminFees = area(admin, 'AdminFees');
const AdminAudit = area(admin, 'AdminAudit');
const AdminOrders = area(admin, 'AdminOrders');

const MessagesPage = area(shared, 'MessagesPage');
const ConversationPage = area(shared, 'ConversationPage');
const NotificationsPage = area(shared, 'NotificationsPage');

export function AppRoutes() {
  return (
    <Routes>
      {/* Public */}
      <Route element={<PublicLayout />}>
        <Route index element={<LandingPage />} />
        <Route path="search" element={<SearchPage />} />
        <Route path="u/:username" element={<CreatorProfilePage />} />
      </Route>

      {/* Auth */}
      <Route path="login" element={<GuestOnly><LoginPage /></GuestOnly>} />
      <Route path="signup" element={<GuestOnly><SignupPage /></GuestOnly>} />
      <Route path="verify-email" element={<VerifyEmailPage />} />
      <Route path="forgot-password" element={<ForgotPasswordPage />} />
      <Route path="reset-password" element={<ResetPasswordPage />} />

      {/* Signed in */}
      <Route element={<AppShell />}>
        <Route element={<RequireRole roles={['BRAND']} />}>
          <Route path="checkout/offer/:username" element={<CheckoutPage />} />
          <Route path="checkout/:packageId" element={<CheckoutPage />} />
          <Route path="brand">
            <Route index element={<Navigate to="dashboard" replace />} />
            <Route path="dashboard" element={<BrandDashboard />} />
            <Route path="orders" element={<OrdersListPage />} />
            <Route path="orders/:id" element={<OrderDetailPage />} />
            <Route path="campaigns" element={<BrandCampaigns />} />
            <Route path="campaigns/:id" element={<BrandCampaignDetail />} />
            <Route path="profile" element={<BrandProfile />} />
          </Route>
        </Route>

        <Route element={<RequireRole roles={['CREATOR']} />}>
          <Route path="creator">
            <Route index element={<Navigate to="dashboard" replace />} />
            <Route path="onboarding" element={<CreatorOnboarding />} />
            <Route path="dashboard" element={<CreatorDashboard />} />
            <Route path="orders" element={<OrdersListPage />} />
            <Route path="orders/:id" element={<OrderDetailPage />} />
            <Route path="campaigns" element={<CreatorCampaigns />} />
            <Route path="packages" element={<CreatorPackages />} />
            <Route path="payouts" element={<CreatorPayouts />} />
          </Route>
        </Route>

        <Route element={<RequireRole roles={['ADMIN']} />}>
          <Route path="admin">
            <Route index element={<Navigate to="vetting" replace />} />
            <Route path="vetting" element={<AdminVetting />} />
            <Route path="disputes" element={<AdminDisputes />} />
            <Route path="users" element={<AdminUsers />} />
            <Route path="fees" element={<AdminFees />} />
            <Route path="audit" element={<AdminAudit />} />
            <Route path="orders" element={<AdminOrders />} />
          </Route>
        </Route>

        <Route element={<RequireRole />}>
          <Route path="messages" element={<MessagesPage />} />
          <Route path="messages/:conversationId" element={<ConversationPage />} />
          <Route path="notifications" element={<NotificationsPage />} />
        </Route>
      </Route>

      {/* Prototype only: stand-in for the Stripe-hosted onboarding page (FR-62). */}
      {isMock && (
        <Route element={<RequireRole roles={['CREATOR']} />}>
          <Route path="dev/stripe-connect" element={<MockStripeConnectPage />} />
        </Route>
      )}

      <Route element={<PublicLayout />}>
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}

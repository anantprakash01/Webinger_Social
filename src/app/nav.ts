import type { IconType } from 'react-icons';
import {
  LuBadgeCheck,
  LuBell,
  LuBuilding2,
  LuLayoutDashboard,
  LuMegaphone,
  LuMessageSquare,
  LuPackage,
  LuPercent,
  LuReceipt,
  LuScale,
  LuScrollText,
  LuSearch,
  LuShoppingBag,
  LuUserRound,
  LuUsers,
  LuWallet,
} from 'react-icons/lu';
import type { Role } from '@/types';

export interface NavItem {
  to: string;
  label: string;
  icon: IconType;
  /** Shown in the phone bottom bar. Keep four per role; the rest go in "More". */
  primary?: boolean;
}

export const NAV: Record<Role, NavItem[]> = {
  BRAND: [
    { to: '/brand/dashboard', label: 'Dashboard', icon: LuLayoutDashboard, primary: true },
    { to: '/search', label: 'Find creators', icon: LuSearch, primary: true },
    { to: '/brand/orders', label: 'Orders', icon: LuShoppingBag, primary: true },
    { to: '/brand/campaigns', label: 'Campaigns', icon: LuMegaphone },
    { to: '/messages', label: 'Messages', icon: LuMessageSquare, primary: true },
    { to: '/notifications', label: 'Notifications', icon: LuBell },
    { to: '/brand/profile', label: 'Company profile', icon: LuBuilding2 },
  ],
  CREATOR: [
    { to: '/creator/dashboard', label: 'Dashboard', icon: LuLayoutDashboard, primary: true },
    { to: '/creator/orders', label: 'Orders', icon: LuShoppingBag, primary: true },
    { to: '/creator/packages', label: 'Packages', icon: LuPackage },
    { to: '/creator/campaigns', label: 'Campaigns', icon: LuMegaphone },
    { to: '/messages', label: 'Messages', icon: LuMessageSquare, primary: true },
    { to: '/creator/payouts', label: 'Payouts', icon: LuWallet, primary: true },
    { to: '/notifications', label: 'Notifications', icon: LuBell },
    { to: '/creator/onboarding', label: 'My profile', icon: LuUserRound },
  ],
  ADMIN: [
    { to: '/admin/vetting', label: 'Vetting', icon: LuBadgeCheck, primary: true },
    { to: '/admin/disputes', label: 'Disputes', icon: LuScale, primary: true },
    { to: '/admin/orders', label: 'Orders', icon: LuReceipt, primary: true },
    { to: '/admin/users', label: 'Users', icon: LuUsers, primary: true },
    { to: '/admin/fees', label: 'Fees & plans', icon: LuPercent },
    { to: '/admin/audit', label: 'Audit log', icon: LuScrollText },
  ],
};

export const AREA_TITLE: Record<Role, string> = {
  BRAND: 'Brand workspace',
  CREATOR: 'Creator workspace',
  ADMIN: 'Admin',
};

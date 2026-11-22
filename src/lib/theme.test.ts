import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { getThemePref, resolveTheme, setThemePref, useTheme, THEME_KEY } from './theme';

afterEach(() => {
  localStorage.removeItem(THEME_KEY);
  delete document.documentElement.dataset.theme;
  vi.unstubAllGlobals();
});

/** jsdom has no matchMedia: stand in for the device's colour-scheme setting. */
const mockSystem = (dark: boolean) =>
  vi.stubGlobal('matchMedia', (q: string) => ({ matches: dark && q.includes('dark'), media: q, addEventListener: () => {}, removeEventListener: () => {} }) as unknown as MediaQueryList);

describe('day / night mode', () => {
  it('follows the device until a choice is made', () => {
    mockSystem(true);
    expect(getThemePref()).toBe('system');
    expect(resolveTheme('system')).toBe('dark');
    expect(document.documentElement.dataset.theme).toBeUndefined();
  });

  it('saves an explicit choice on the html element and in storage; system clears it', () => {
    mockSystem(false);
    setThemePref('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(localStorage.getItem(THEME_KEY)).toBe('dark');
    setThemePref('system');
    expect(document.documentElement.dataset.theme).toBeUndefined();
    expect(localStorage.getItem(THEME_KEY)).toBeNull();
  });

  it('toggle flips between day and night', () => {
    mockSystem(false);
    const { result } = renderHook(() => useTheme());
    expect(result.current.resolved).toBe('light');
    act(() => result.current.toggle());
    expect(result.current).toMatchObject({ pref: 'dark', resolved: 'dark' });
    act(() => result.current.toggle());
    expect(result.current).toMatchObject({ pref: 'light', resolved: 'light' });
  });
});

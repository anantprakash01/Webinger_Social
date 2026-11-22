import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup, configure } from '@testing-library/react';
import { queryClient } from '@/app/queryClient';

// Full-page UI tests render 24 creator cards; role queries over that DOM are slow in jsdom,
// so the default 1 s wait is too tight on a busy machine. Real failures still fail, just later.
configure({ asyncUtilTimeout: 5_000 });

afterEach(() => {
  cleanup();
  // The app's query cache is a module singleton; never let one test see another's data.
  queryClient.clear();
  sessionStorage.clear();
});

// jsdom does not implement scrolling; pages call it after navigation.
window.scrollTo = () => {};

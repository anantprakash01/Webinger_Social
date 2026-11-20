import { QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider, useAuth } from './AuthContext';
import { queryClient } from './queryClient';
import { AppRoutes } from './routes';

function Gate() {
  const { ready } = useAuth();
  // http mode: wait for the refresh-cookie check so guards don't bounce a signed-in user to /login.
  if (!ready) return <div className="splash" aria-busy="true" aria-label="Loading" />;
  return <AppRoutes />;
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <Gate />
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
}

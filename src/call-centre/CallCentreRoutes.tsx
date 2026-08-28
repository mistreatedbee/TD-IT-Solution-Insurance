import { Navigate, Route, Routes } from 'react-router-dom';
import { DashboardAuthProvider } from '../dashboard/auth/DashboardAuthProvider';
import { PrivilegedLoginPage } from '../dashboard/components/PrivilegedLoginPage';
import { CallCentreAuthGate, CallCentreLayout } from './layout/CallCentreLayout';
import { CustomerLookupPage } from './pages/CustomerLookupPage';

export default function CallCentreRoutes() {
  return (
    <DashboardAuthProvider
      config={{
        storageKey: 'td-call-centre-refresh-token',
        allowedUserType: 'support_agent',
      }}
    >
      <Routes>
        <Route
          path="login"
          element={
            <PrivilegedLoginPage
              title="Call centre sign in"
              subtitle="Customer lookup — MFA required."
              defaultRedirect="/call-centre/lookup"
            />
          }
        />
        <Route element={<CallCentreAuthGate />}>
          <Route element={<CallCentreLayout />}>
            <Route index element={<Navigate to="lookup" replace />} />
            <Route path="lookup" element={<CustomerLookupPage />} />
          </Route>
        </Route>
        <Route path="*" element={<Navigate to="login" replace />} />
      </Routes>
    </DashboardAuthProvider>
  );
}

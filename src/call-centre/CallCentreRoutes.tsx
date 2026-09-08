import { Navigate, Route, Routes, useParams } from 'react-router-dom';
import { DashboardAuthProvider } from '../dashboard/auth/DashboardAuthProvider';
import { PRIVILEGED_DASHBOARD_CONFIG } from '../dashboard/auth/roleRouting';
import { PrivilegedLoginPage } from '../dashboard/components/PrivilegedLoginPage';
import { CallCentreAuthGate, CallCentreLayout } from './layout/CallCentreLayout';
import { CustomerLookupPage } from './pages/CustomerLookupPage';
import { CreateSupportCasePage, SupportCaseDetailPage, SupportCasesListPage } from './pages/SupportCasesPages';

function SupportCaseDetailRoute() {
  const { caseId } = useParams();
  if (!caseId) return <Navigate to="/call-centre/cases" replace />;
  return <SupportCaseDetailPage caseId={caseId} />;
}

export default function CallCentreRoutes() {
  return (
    <DashboardAuthProvider
      config={{
        storageKey: PRIVILEGED_DASHBOARD_CONFIG.support_agent.storageKey,
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
            <Route path="cases" element={<SupportCasesListPage />} />
            <Route path="cases/new" element={<CreateSupportCasePage />} />
            <Route path="cases/:caseId" element={<SupportCaseDetailRoute />} />
          </Route>
        </Route>
        <Route path="*" element={<Navigate to="login" replace />} />
      </Routes>
    </DashboardAuthProvider>
  );
}

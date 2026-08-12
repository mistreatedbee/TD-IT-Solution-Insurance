import { Navigate, Route, Routes } from 'react-router-dom';
import { DashboardAuthProvider } from '../dashboard/auth/DashboardAuthProvider';
import { PrivilegedLoginPage } from '../dashboard/components/PrivilegedLoginPage';
import { SecurityAuthGate, SecurityLayout } from './layout/SecurityLayout';
import { CaseDetailPage, CasesListPage } from './pages/SecurityCasePages';

export default function SecurityRoutes() {
  return (
    <DashboardAuthProvider
      config={{
        storageKey: 'td-security-refresh-token',
        allowedUserType: 'security_company_operator',
      }}
    >
      <Routes>
        <Route
          path="login"
          element={
            <PrivilegedLoginPage
              title="Security partner sign in"
              subtitle="Recovery operations dashboard — MFA required."
              defaultRedirect="/security/cases"
            />
          }
        />
        <Route element={<SecurityAuthGate />}>
          <Route element={<SecurityLayout />}>
            <Route index element={<Navigate to="cases" replace />} />
            <Route path="cases" element={<CasesListPage />} />
            <Route path="cases/:caseId" element={<CaseDetailPage />} />
          </Route>
        </Route>
        <Route path="*" element={<Navigate to="login" replace />} />
      </Routes>
    </DashboardAuthProvider>
  );
}

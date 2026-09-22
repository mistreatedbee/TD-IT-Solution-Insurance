import { Navigate, Route, Routes } from 'react-router-dom';
import { DashboardAuthProvider } from '../dashboard/auth/DashboardAuthProvider';
import { PRIVILEGED_DASHBOARD_CONFIG } from '../dashboard/auth/roleRouting';
import { PrivilegedLoginPage } from '../dashboard/components/PrivilegedLoginPage';
import { Card, SectionHeading } from '../components';
import { isSecurityOperatorEnabled } from '../lib/features';
import { SecurityAuthGate, SecurityLayout } from './layout/SecurityLayout';
import { CaseDetailPage, CasesListPage } from './pages/SecurityCasePages';
import { SecurityHomePage } from './pages/SecurityHomePage';

/**
 * INC-002: the security-company operator dashboard has no Stage 8 record for
 * the partner-agreement workstream — gated off by default via
 * `VITE_FEATURE_SECURITY_OPERATOR`, mirroring mobile's
 * `EXPO_PUBLIC_FEATURE_SECURITY_OPERATOR`. When disabled, every `/security/*`
 * path (including `/security/login`) renders this unavailable state instead
 * of the real routes — no auth bypass path exists around the flag.
 */
function SecurityOperatorUnavailable() {
  return (
    <div className="flex min-h-full items-center justify-center p-6">
      <Card padding="lg">
        <SectionHeading as="h1" title="Security partner dashboard unavailable" size="md" className="mb-2" />
        <p className="text-sm text-text-secondary">
          This dashboard is not yet available. Please check back later.
        </p>
      </Card>
    </div>
  );
}

export default function SecurityRoutes() {
  if (!isSecurityOperatorEnabled()) {
    return (
      <Routes>
        <Route path="*" element={<SecurityOperatorUnavailable />} />
      </Routes>
    );
  }

  return (
    <DashboardAuthProvider
      config={{
        storageKey: PRIVILEGED_DASHBOARD_CONFIG.security_company_operator.storageKey,
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
            <Route index element={<SecurityHomePage />} />
            <Route path="cases" element={<CasesListPage />} />
            <Route path="cases/:caseId" element={<CaseDetailPage />} />
          </Route>
        </Route>
        <Route path="*" element={<Navigate to="login" replace />} />
      </Routes>
    </DashboardAuthProvider>
  );
}

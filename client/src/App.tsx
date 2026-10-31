
import {
  Navigate,
  Route,
  Routes,
} from "react-router";

import AppLayout from "./components/AppLayout";

import {
  AdminOnlyRoute,
  ProtectedRoute,
  PermissionRoute,
  PublicOnlyRoute,
} from "./components/ProtectedRoute";

import LoginPage from "./pages/LoginPage";
import DashboardPage from "./pages/DashboardPage";
import MembersPage from "./pages/MembersPage";
import AddMemberPage from "./pages/AddMemberPage";
import MemberProfilePage from "./pages/MemberProfilePage";
import EditMemberPage from "./pages/EditMemberPage";
import PlansPage from "./pages/PlansPage";
import PlanFormPage from "./pages/PlanFormPage";
import MemberMembershipPage from "./pages/MemberMembershipPage";
import BillingPage from "./pages/BillingPage";
import InvoiceDetailPage from "./pages/InvoiceDetailPage";
import PaymentReceiptPage from "./pages/PaymentReceiptPage";
import AttendancePage from "./pages/AttendancePage";
import AttentionPage from "./pages/AttentionPage";
import MemberFollowUpPage from "./pages/MemberFollowUpPage";
import DueFollowUpsPage from "./pages/DueFollowUpsPage";
import ReportsPage from "./pages/ReportsPage";
import ExpenseManagementPage from "./pages/ExpenseManagementPage";
import DailyCashClosingPage from "./pages/DailyCashClosingPage";
import ClosingHistoryPage from "./pages/ClosingHistoryPage";


function ModulePlaceholder({
  title,
}: {
  title: string;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-gym-card p-8">
      <h2 className="text-2xl font-black text-white">
        {title}
      </h2>

      <p className="mt-3 text-sm text-gym-muted">
        This module will be implemented in an
        upcoming sprint.
      </p>
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      {/* Public routes */}
      <Route element={<PublicOnlyRoute />}>
        <Route
          path="/login"
          element={<LoginPage />}
        />
      </Route>

      {/* Authenticated staff routes */}
      <Route element={<ProtectedRoute />}>
        <Route element={<AppLayout />}>
          <Route
            path="/dashboard"
            element={<DashboardPage />}
          />

          <Route
            path="/members"
            element={<PermissionRoute permissions={["members.read"]}><MembersPage /></PermissionRoute>}
          />

          <Route
            path="/members/new"
            element={<PermissionRoute permissions={["members.create"]}><AddMemberPage /></PermissionRoute>}
          />

          <Route
            path="/members/:id"
            element={<PermissionRoute permissions={["members.read"]}><MemberProfilePage /></PermissionRoute>}
          />

          <Route
            path="/members/:id/edit"
            element={<PermissionRoute permissions={["members.read", "members.update"]}><EditMemberPage /></PermissionRoute>}
          />
          
          <Route
            path="/members/:id/membership"
            element={<PermissionRoute permissions={["members.read", "memberships.read"]}><MemberMembershipPage /></PermissionRoute>}
          />

          <Route
            path="/plans"
            element={<PermissionRoute permissions={["plans.read"]}><PlansPage /></PermissionRoute>}
          />

          <Route
            path="/payments"
            element={<PermissionRoute permissions={["invoices.read"]}><BillingPage /></PermissionRoute>}
          />
          
          <Route
            path="/payments/invoices/:id"
            element={<PermissionRoute permissions={["invoices.read"]}><InvoiceDetailPage /></PermissionRoute>}
          />
          
          <Route
            path="/payments/invoices/:invoiceId/receipts/:paymentId"
            element={<PermissionRoute permissions={["invoices.read", "payments.read", "members.read"]}><PaymentReceiptPage /></PermissionRoute>}
          />
          
          <Route
            path="/attendance"
            element={<PermissionRoute permissions={["attendance.read"]}><AttendancePage /></PermissionRoute>}
          />
          
          <Route
            path="/attention"
            element={<PermissionRoute permissions={["attention.read"]}><AttentionPage /></PermissionRoute>}
          />

          <Route
            path="/attention/follow-ups/due"
            element={<PermissionRoute permissions={["follow-ups.read"]}><DueFollowUpsPage /></PermissionRoute>}
          />

          <Route
            path="/attention/follow-ups/member/:memberId/:alertType"
            element={<PermissionRoute permissions={["follow-ups.read"]}><MemberFollowUpPage /></PermissionRoute>}
          />

          {/* Admin-only routes */}
          <Route element={<AdminOnlyRoute />}>
            <Route path="/expenses" element={<PermissionRoute permissions={["expenses.manage"]}><ExpenseManagementPage /></PermissionRoute>} />
            <Route path="/cash-closing" element={<PermissionRoute permissions={["cash-closings.manage"]}><DailyCashClosingPage /></PermissionRoute>} />
            <Route path="/closing-history" element={<PermissionRoute permissions={["cash-closings.manage"]}><ClosingHistoryPage /></PermissionRoute>} />
            <Route
              path="/reports"
              element={<ReportsPage />}
            />

            <Route
              path="/settings"
              element={
                <ModulePlaceholder title="System Settings" />
              }
            />

            <Route
              path="/plans/new"
              element={<PlanFormPage />}
            />

            <Route
              path="/plans/:id/edit"
              element={<PlanFormPage />}
            />
          </Route>
        </Route>
      </Route>

      {/* Default routes */}
      <Route
        path="/"
        element={
          <Navigate to="/dashboard" replace />
        }
      />

      <Route
        path="*"
        element={
          <Navigate to="/dashboard" replace />
        }
      />
    </Routes>
  );
}

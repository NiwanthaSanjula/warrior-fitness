import { lazy } from "react";
import AsyncPage from "./components/AsyncPage";

import {
  Navigate,
  Link,
  Route,
  Routes,
} from "react-router";

import AppLayout from "./components/AppLayout";

import {
  AdminOnlyRoute,
  ProtectedRoute,
  PermissionRoute,
  FrontDeskRoute,
  PublicOnlyRoute,
  MutationRoute,
} from "./components/ProtectedRoute";

const LoginPage = lazy(() => import("./pages/LoginPage"));
const DashboardPage = lazy(() => import("./pages/DashboardPage"));
const FrontDeskPage = lazy(() => import("./pages/FrontDeskPage"));
const MembersPage = lazy(() => import("./pages/MembersPage"));
const AddMemberPage = lazy(() => import("./pages/AddMemberPage"));
const MemberProfilePage = lazy(() => import("./pages/MemberProfilePage"));
const EditMemberPage = lazy(() => import("./pages/EditMemberPage"));
const PlansPage = lazy(() => import("./pages/PlansPage"));
const PlanFormPage = lazy(() => import("./pages/PlanFormPage"));
const MemberMembershipPage = lazy(() => import("./pages/MemberMembershipPage"));
const BillingPage = lazy(() => import("./pages/BillingPage"));
const InvoiceDetailPage = lazy(() => import("./pages/InvoiceDetailPage"));
const PaymentReceiptPage = lazy(() => import("./pages/PaymentReceiptPage"));
const AttendancePage = lazy(() => import("./pages/AttendancePage"));
const AttentionPage = lazy(() => import("./pages/AttentionPage"));
const MemberFollowUpPage = lazy(() => import("./pages/MemberFollowUpPage"));
const DueFollowUpsPage = lazy(() => import("./pages/DueFollowUpsPage"));
const ReportsPage = lazy(() => import("./pages/ReportsPage"));
const ExpenseManagementPage = lazy(() => import("./pages/ExpenseManagementPage"));
const DailyCashClosingPage = lazy(() => import("./pages/DailyCashClosingPage"));
const ClosingHistoryPage = lazy(() => import("./pages/ClosingHistoryPage"));
const StaffManagementPage = lazy(() => import("./pages/StaffManagementPage"));
const NotificationsPage = lazy(() => import("./pages/NotificationsPage"));
const EquipmentPage = lazy(() => import("./pages/EquipmentPage"));
const EquipmentDetailPage = lazy(() => import("./pages/EquipmentDetailPage"));
const EquipmentMaintenancePage = lazy(() => import("./pages/EquipmentMaintenancePage"));
const RetailCheckoutPage = lazy(() => import("./pages/RetailCheckoutPage"));
const RetailProductsPage = lazy(() => import("./pages/RetailProductsPage"));
const RetailSalesPage = lazy(() => import("./pages/RetailSalesPage"));
const RetailReceiptPage = lazy(() => import("./pages/RetailReceiptPage"));
const RetailDashboardPage = lazy(() => import("./pages/RetailDashboardPage"));


function SettingsPage() {
  return <div className="space-y-5"><h1 className="text-2xl font-bold">System settings</h1><dl className="flex flex-wrap gap-8 rounded-2xl border border-white/10 bg-gym-card p-5"><div><dt className="text-xs text-gym-muted">Gym timezone</dt><dd className="mt-1 font-semibold">Asia/Colombo</dd></div><div><dt className="text-xs text-gym-muted">Currency</dt><dd className="mt-1 font-semibold">LKR · whole rupees</dd></div></dl><nav aria-label="Administration settings" className="grid gap-3 sm:grid-cols-3">{[["Staff & permissions", "/staff"], ["Membership plans", "/plans"], ["Reminder automation", "/notifications#automation-status"]].map(([label, to]) => <Link key={to} to={to} className="rounded-xl border border-white/10 bg-gym-card p-5 text-sm font-semibold text-zinc-200 hover:border-gym-orange">{label}</Link>)}</nav></div>;
}

export default function App() {
  return (
    <Routes>
      {/* Public routes */}
      <Route element={<PublicOnlyRoute />}>
        <Route
          path="/login"
          element={<AsyncPage><LoginPage /></AsyncPage>}
        />
      </Route>

      {/* Authenticated staff routes */}
      <Route element={<ProtectedRoute />}>
        <Route element={<AppLayout />}>
          <Route
            path="/dashboard"
            element={<AsyncPage><DashboardPage /></AsyncPage>}
          />

          <Route
            path="/members"
            element={<PermissionRoute permissions={["members.read"]}><AsyncPage><MembersPage /></AsyncPage></PermissionRoute>}
          />

          <Route path="/front-desk" element={<FrontDeskRoute><AsyncPage><FrontDeskPage /></AsyncPage></FrontDeskRoute>} />

          <Route
            path="/members/new"
            element={<PermissionRoute permissions={["members.create"]}><AsyncPage><AddMemberPage /></AsyncPage></PermissionRoute>}
          />

          <Route
            path="/members/:id"
            element={<PermissionRoute permissions={["members.read"]}><AsyncPage><MemberProfilePage /></AsyncPage></PermissionRoute>}
          />

          <Route
            path="/members/:id/edit"
            element={<PermissionRoute permissions={["members.read", "members.update"]}><AsyncPage><EditMemberPage /></AsyncPage></PermissionRoute>}
          />
          
          <Route
            path="/members/:id/membership"
            element={<PermissionRoute permissions={["members.read", "memberships.read"]}><AsyncPage><MemberMembershipPage /></AsyncPage></PermissionRoute>}
          />

          <Route
            path="/plans"
            element={<PermissionRoute permissions={["plans.read"]}><AsyncPage><PlansPage /></AsyncPage></PermissionRoute>}
          />

          <Route
            path="/payments"
            element={<PermissionRoute permissions={["invoices.read"]}><AsyncPage><BillingPage /></AsyncPage></PermissionRoute>}
          />
          
          <Route
            path="/payments/invoices/:id"
            element={<PermissionRoute permissions={["invoices.read"]}><AsyncPage><InvoiceDetailPage /></AsyncPage></PermissionRoute>}
          />
          
          <Route
            path="/payments/invoices/:invoiceId/receipts/:paymentId"
            element={<PermissionRoute permissions={["invoices.read", "payments.read", "members.read"]}><AsyncPage><PaymentReceiptPage /></AsyncPage></PermissionRoute>}
          />
          
          <Route
            path="/attendance"
            element={<PermissionRoute permissions={["attendance.read"]}><AsyncPage><AttendancePage /></AsyncPage></PermissionRoute>}
          />
          
          <Route
            path="/attention"
            element={<PermissionRoute permissions={["attention.read"]}><AsyncPage><AttentionPage /></AsyncPage></PermissionRoute>}
          />

          <Route
            path="/attention/follow-ups/due"
            element={<PermissionRoute permissions={["follow-ups.read"]}><AsyncPage><DueFollowUpsPage /></AsyncPage></PermissionRoute>}
          />

          <Route
            path="/attention/follow-ups/member/:memberId/:alertType"
            element={<PermissionRoute permissions={["follow-ups.read"]}><AsyncPage><MemberFollowUpPage /></AsyncPage></PermissionRoute>}
          />

          {/* Equipment and retail operational routes */}
          <Route path="/retail/checkout" element={<PermissionRoute permissions={["retail.read", "retail.checkout"]}><AsyncPage><RetailCheckoutPage /></AsyncPage></PermissionRoute>} />
          <Route path="/retail/products" element={<PermissionRoute permissions={["retail.read"]}><AsyncPage><RetailProductsPage /></AsyncPage></PermissionRoute>} />
          <Route path="/retail/sales" element={<PermissionRoute permissions={["retail.sales.read"]}><AsyncPage><RetailSalesPage /></AsyncPage></PermissionRoute>} />
          <Route path="/retail/sales/:id" element={<PermissionRoute permissions={["retail.sales.read"]}><AsyncPage><RetailReceiptPage /></AsyncPage></PermissionRoute>} />
          <Route path="/equipment" element={<PermissionRoute permissions={["equipment.read"]}><AsyncPage><EquipmentPage /></AsyncPage></PermissionRoute>} />
          <Route path="/equipment/:id" element={<PermissionRoute permissions={["equipment.read"]}><AsyncPage><EquipmentDetailPage /></AsyncPage></PermissionRoute>} />
          {/* Admin-only routes */}
          <Route element={<AdminOnlyRoute />}>
            <Route path="/retail" element={<PermissionRoute permissions={["retail.manage"]}><AsyncPage><RetailDashboardPage /></AsyncPage></PermissionRoute>} />
            <Route path="/equipment/maintenance" element={<PermissionRoute permissions={["equipment.manage"]}><AsyncPage><EquipmentMaintenancePage /></AsyncPage></PermissionRoute>} />
            <Route path="/notifications" element={<PermissionRoute permissions={["settings.manage"]}><AsyncPage><NotificationsPage /></AsyncPage></PermissionRoute>} />
            <Route path="/staff" element={<PermissionRoute permissions={["staff.manage"]}><AsyncPage><StaffManagementPage /></AsyncPage></PermissionRoute>} />
            <Route path="/expenses" element={<PermissionRoute permissions={["expenses.manage"]}><AsyncPage><ExpenseManagementPage /></AsyncPage></PermissionRoute>} />
            <Route path="/cash-closing" element={<PermissionRoute permissions={["cash-closings.manage"]}><AsyncPage><DailyCashClosingPage /></AsyncPage></PermissionRoute>} />
            <Route path="/closing-history" element={<PermissionRoute permissions={["cash-closings.manage"]}><AsyncPage><ClosingHistoryPage /></AsyncPage></PermissionRoute>} />
            <Route
              path="/reports"
              element={<AsyncPage><ReportsPage /></AsyncPage>}
            />

            <Route
              path="/settings"
              element={
                <SettingsPage />
              }
            />

            <Route
              path="/plans/new"
              element={<MutationRoute><AsyncPage><PlanFormPage /></AsyncPage></MutationRoute>}
            />

            <Route
              path="/plans/:id/edit"
              element={<MutationRoute><AsyncPage><PlanFormPage /></AsyncPage></MutationRoute>}
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

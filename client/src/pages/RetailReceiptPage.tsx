import { useCallback } from "react";
import { Link, useParams } from "react-router";
import { useAuth } from "../auth/auth-context";
import { hasPermissions } from "../auth/permissions";
import { retailApi } from "../api/retail.api";
import { useDashboardResource } from "../hooks/useDashboardResource";
import { DashboardPanel } from "../components/dashboard/DashboardWidgets";
import { RetailFrame, RetailNotice } from "../components/retail/RetailUI";
import RetailReceipt from "../components/retail/RetailReceipt";
import { retailSecondary } from "../utils/retail";
export default function RetailReceiptPage() {
  const { id = "" } = useParams(), { staff } = useAuth(), allowed = hasPermissions(staff, "retail.sales.read"), valid = /^[a-f\d]{24}$/i.test(id);
  const load = useCallback((signal: AbortSignal) => retailApi.sale(id, signal), [id]);
  const receipt = useDashboardResource(allowed && valid, `${staff?.id}:${id}`, load);
  if (!allowed || !valid) return <RetailNotice error message={!valid ? "Invalid retail receipt link." : "Retail sales history permission is required."} />;
  return <RetailFrame title="Retail Receipt" description="Recorded products, prices and payment details are preserved. Sales cannot be edited or deleted." tools={<Link className={retailSecondary} to="/retail/sales">Back to sales</Link>}><DashboardPanel title="Sale snapshot" description="Receptionists can access only their own permitted sales." resource={receipt}>{result => <div className="max-w-2xl"><RetailReceipt sale={result.sale} /></div>}</DashboardPanel></RetailFrame>;
}

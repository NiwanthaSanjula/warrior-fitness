import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { EquipmentItem } from "../../types/equipment";
import { equipmentDetailUrl } from "../../utils/equipment";
import { equipmentSecondary } from "./EquipmentUI";
export default function EquipmentQr({ item }: { item: EquipmentItem }) {
  const url = equipmentDetailUrl(window.location.origin, item.id);
  const [result, setResult] = useState<{ url: string; data?: string; error?: string } | null>(null);
  useEffect(() => {
    let active = true;
    void import("qrcode").then(module => module.default.toDataURL(url, { width: 240, margin: 4, errorCorrectionLevel: "M" })).then(data => { if (active) setResult({ url, data }); }).catch(() => { if (active) setResult({ url, error: "Unable to generate the QR label. Refresh this page to retry." }); });
    return () => { active = false; };
  }, [url]);
  const data = result?.url === url ? result : null;
  const label = <div className="w-fit max-w-full rounded-xl bg-white p-4 text-center text-black"><p className="text-xs font-black">WARRIOR FITNESS</p>{data?.data ? <img src={data.data} width={240} height={240} alt={`QR code for ${item.assetId}`} className="max-w-full" /> : <p role={data?.error ? "alert" : "status"} className="max-w-60 py-8 text-sm">{data?.error ?? "Generating QR label…"}</p>}<p className="break-words font-black">{item.assetId}</p><p className="max-w-60 break-words text-xs">{item.name}</p><p className="mt-2 text-[10px]">Staff access required</p></div>;
  return <section aria-label="Printable equipment QR label" className="space-y-4 rounded-2xl border border-white/10 bg-gym-card p-5"><h2 className="text-lg font-bold">Equipment QR label</h2><p className="text-xs leading-6 text-gym-muted">Scan to open this equipment profile. Staff login and permissions are required. The QR contains only the profile URL.</p>
    {label}
    <button type="button" disabled={!data?.data} onClick={() => window.print()} className={equipmentSecondary}>Print QR label</button>
    {createPortal(<div id="equipment-print-label" style={{ display: "none" }}>{label}</div>, document.body)}
    <style>{"@media print { body > :not(#equipment-print-label) { display: none !important; } body > div#equipment-print-label { display: block !important; color: #000 !important; background: #fff !important; } @page { margin: 12mm; } }"}</style>
  </section>;
}

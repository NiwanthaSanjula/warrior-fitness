export function equipmentDetailUrl(origin: string, id: string): string {
  if (!/^[a-f\d]{24}$/i.test(id)) throw new Error("Invalid equipment ID");
  const base = new URL(origin);
  if (!["http:", "https:"].includes(base.protocol)) throw new Error("Unsupported equipment URL origin");
  return `${base.origin}/equipment/${id.toLowerCase()}`;
}
export function equipmentLoginReturn(state: unknown): string {
  if (typeof state !== "object" || !state || !("equipmentReturnTo" in state) || typeof state.equipmentReturnTo !== "string") return "/dashboard";
  return /^\/equipment(?:\/(?:[a-f\d]{24}|maintenance))?\/?$/i.test(state.equipmentReturnTo) ? state.equipmentReturnTo : "/dashboard";
}
export const formText = (data: FormData, key: string) => String(data.get(key) ?? "").trim();
export const formNumber = (data: FormData, key: string) => formText(data, key) === "" ? null : Number(formText(data, key));

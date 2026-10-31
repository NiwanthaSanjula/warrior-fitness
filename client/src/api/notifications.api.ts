import { api } from "./api";
export interface DueReminder {
  memberId: string; membershipId: string; memberReference: string; memberName: string;
  recipient: string; planName: string; lastValidDate: string; scheduledDate: string;
  reminderType: "SEVEN_DAYS" | "THREE_DAYS" | "LAST_VALID_DAY"; message: string;
}
export interface NotificationOverview {
  success: boolean; asOfDate: string; due: DueReminder[]; simulatedToday: number;
  deliveryMode: "SIMULATION_ONLY";
  scheduler: AutomaticSimulationStatus;
  recent: Array<DueReminder & { id: string; channel: "WHATSAPP_SIMULATED"; status: "SIMULATED"; trigger: "MANUAL" | "SCHEDULED"; createdBy: string | null; createdAt: string }>;
}
export interface AutomaticSimulationStatus {
  enabled: boolean; timeZone: "Asia/Colombo"; dailyTime: "09:00";
  nextRunAt: string | null; deliveryMode: "SIMULATION_ONLY"; historyAvailable: boolean;
  lastRun: { scheduledDate: string; status: "RUNNING" | "SUCCEEDED" | "FAILED"; startedAt: string;
    completedAt: string | null; summary: { due: number; simulated: number; duplicates: number; skipped: number } | null;
    failureCode: "SIMULATION_FAILED" | null;
  } | null;
}
export interface MemberNotificationConsent {
  success: boolean; memberId: string; memberName: string; whatsappOptIn: boolean; updatedAt: string | null;
}
export interface SimulationResult {
  success: boolean; due: number; simulated: number; duplicates: number; skipped: number;
  realMessagesSent: 0; deliveryMode: "SIMULATION_ONLY";
}
export const notificationsApi = {
  async overview(signal?: AbortSignal): Promise<NotificationOverview> { return (await api.get<NotificationOverview>("/notifications/overview", { signal })).data; },
  async simulate(): Promise<SimulationResult> {
    return (await api.post<SimulationResult>("/notifications/simulate-due")).data;
  },
  async consent(memberId: string, signal?: AbortSignal): Promise<MemberNotificationConsent> {
    return (await api.get<MemberNotificationConsent>("/notifications/consent/" + encodeURIComponent(memberId), { signal })).data;
  },
  async saveConsent(memberId: string, whatsappOptIn: boolean, confirmedOptIn = false): Promise<MemberNotificationConsent> {
    return (await api.put<MemberNotificationConsent>("/notifications/consent", { memberId, whatsappOptIn, ...(whatsappOptIn ? { confirmedOptIn } : {}) })).data;
  },
};

import { api } from "./api";
export interface DueReminder {
  memberId: string; membershipId: string; memberReference: string; memberName: string;
  recipient: string; planName: string; lastValidDate: string; scheduledDate: string;
  reminderType: "SEVEN_DAYS" | "THREE_DAYS" | "LAST_VALID_DAY"; message: string;
}
export interface NotificationOverview {
  success: boolean; asOfDate: string; due: DueReminder[]; simulatedToday: number;
  deliveryMode: "SIMULATION_ONLY";
  recent: Array<DueReminder & { _id: string; status: "SIMULATED"; createdAt: string }>;
}
export const notificationsApi = {
  async overview(): Promise<NotificationOverview> { return (await api.get<NotificationOverview>("/notifications/overview")).data; },
  async simulate(): Promise<{ simulated: number; duplicates: number; realMessagesSent: number }> {
    return (await api.post("/notifications/simulate-due")).data;
  },
  async consent(memberId: string): Promise<{ memberName: string; whatsappOptIn: boolean }> {
    return (await api.get("/notifications/consent/" + encodeURIComponent(memberId))).data;
  },
  async saveConsent(memberId: string, whatsappOptIn: boolean): Promise<void> {
    await api.put("/notifications/consent", { memberId, whatsappOptIn });
  },
};

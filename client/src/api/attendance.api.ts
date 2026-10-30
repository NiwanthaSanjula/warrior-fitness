
import { api } from "./api";

import type {
  AttendanceMemberSearchResponse,
  AttendanceSummaryResponse,
  CheckInResponse,
  DailyAttendanceParams,
  DailyAttendanceResponse,
  MemberAttendanceHistoryParams,
  MemberAttendanceHistoryResponse,
} from "../types/attendance";

export const attendanceApi = {
  // Search registered members.
  async searchMembers(
    query: string,
    signal?: AbortSignal
  ): Promise<AttendanceMemberSearchResponse> {
    const response =
      await api.get<AttendanceMemberSearchResponse>(
        "/attendance/member-search",
        {
          params: { q: query },
          signal,
        }
      );

    return response.data;
  },

  // Record a member check-in.
  async checkIn(
    memberId: string
  ): Promise<CheckInResponse> {
    const response = await api.post<CheckInResponse>(
      "/attendance/check-in",
      { memberId }
    );

    return response.data;
  },

  // Daily attendance directory.
  async getDaily(
    params: DailyAttendanceParams,
    signal?: AbortSignal
  ): Promise<DailyAttendanceResponse> {
    const response =
      await api.get<DailyAttendanceResponse>(
        "/attendance",
        { params, signal }
      );

    return response.data;
  },

  // Daily attendance statistics.
  async getSummary(
    date: string,
    signal?: AbortSignal
  ): Promise<AttendanceSummaryResponse> {
    const response =
      await api.get<AttendanceSummaryResponse>(
        "/attendance/summary",
        {
          params: { date },
          signal,
        }
      );

    return response.data;
  },

  // NEW: Attendance history for a specific member.
  async getMemberHistory(
    memberId: string,
    params: MemberAttendanceHistoryParams = {},
    signal?: AbortSignal
  ): Promise<MemberAttendanceHistoryResponse> {
    const response =
      await api.get<MemberAttendanceHistoryResponse>(
        `/attendance/member/${encodeURIComponent(memberId)}`,
        {
          params,
          signal,
        }
      );

    return response.data;
  },
};

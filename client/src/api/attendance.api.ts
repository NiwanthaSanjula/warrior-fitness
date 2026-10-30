
import { api } from "./api";

import type {
  AttendanceMemberSearchResponse,
  AttendanceSummaryResponse,
  CheckInResponse,
  DailyAttendanceParams,
  DailyAttendanceResponse,
} from "../types/attendance";

export const attendanceApi = {
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

  async checkIn(
    memberId: string
  ): Promise<CheckInResponse> {
    const response = await api.post<CheckInResponse>(
      "/attendance/check-in",
      { memberId }
    );

    return response.data;
  },

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
};

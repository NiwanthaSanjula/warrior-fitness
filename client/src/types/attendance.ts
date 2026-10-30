
export interface AttendanceRecord {
  id: string;

  memberId: string;
  membershipId: string;

  attendanceDate: string;
  checkedInAt: string;
  checkedInBy: string;
  createdAt: string;

  memberName?: string | null;
  memberReference?: string | null;
  memberPhone?: string | null;
  memberProfileActive?: boolean | null;
}

export interface AttendanceMember {
  id: string;
  memberId: string;
  fullName: string;
  phone: string;
  isActive: boolean;
}

export interface AttendanceMemberSearchResponse {
  success: boolean;
  data: AttendanceMember[];
}

export interface CheckInResponse {
  success: boolean;
  message: string;
  alreadyCheckedIn: boolean;
  data: AttendanceRecord;
}

export interface DailyAttendanceResponse {
  success: boolean;
  date: string;
  data: AttendanceRecord[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface AttendanceDayCount {
  date: string;
  checkIns: number;
}

export interface AttendanceSummary {
  date: string;
  totalCheckIns: number;
  previousDayCheckIns: number;
  changeFromPreviousDay: number;
  last7Days: AttendanceDayCount[];
}

export interface AttendanceSummaryResponse {
  success: boolean;
  data: AttendanceSummary;
}

export interface DailyAttendanceParams {
  date?: string;
  search?: string;
  page?: number;
  limit?: number;
}

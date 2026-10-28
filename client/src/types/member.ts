
export type MemberGender =
  | "MALE"
  | "FEMALE"
  | "OTHER"
  | "PREFER_NOT_TO_SAY";

export type MemberStatusFilter =
  | "all"
  | "active"
  | "inactive";

export interface EmergencyContact {
  name: string;
  phone: string;
}

export interface Member {
  id: string;
  memberId: string;
  fullName: string;
  phone: string;
  gender: MemberGender | null;
  dateOfBirth: string | null;
  address: string | null;
  emergencyContact: EmergencyContact | null;
  joinedAt: string;
  isActive: boolean;
  createdBy: string;
}

export interface MemberPagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface MemberListResponse {
  success: boolean;
  data: Member[];
  pagination: MemberPagination;
}

export interface MemberListParams {
  page: number;
  limit: number;
  q: string;
  status: MemberStatusFilter;
}
export interface CreateMemberPayload {
  fullName: string;
  phone: string;
  gender?: MemberGender;
  dateOfBirth?: string;
  address?: string;
  emergencyContact?: EmergencyContact;
}

export interface MemberResponse {
  success: boolean;
  message: string;
  data: Member;
}

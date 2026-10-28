
import { api } from "./api";

import type {
  CreateMemberPayload,
  MemberListParams,
  MemberListResponse,
  MemberResponse,
  UpdateMemberPayload,
} from "../types/member";

export const membersApi = {

  // GET /api/members
  async getMembers(
    params: MemberListParams,
    signal?: AbortSignal
  ): Promise<MemberListResponse> {
    const response = await api.get<MemberListResponse>(
      "/members",
      {
        params,
        signal,
      }
    )
    
    return response.data;
  },

  // POST /api/members
  async createMember(
    data: CreateMemberPayload
  ): Promise<MemberResponse> {
    const response = await api.post<MemberResponse>(
      "/members",
      data
    );

    return response.data;
  },

  // GET /api/members/:id
  async getMemberById(
    id: string,
    signal?: AbortSignal
  ): Promise<MemberResponse> {
    const response = await api.get<MemberResponse>(
      `/members/${encodeURIComponent(id)}`,
      { signal }
    );

    return response.data;
  },

  // PATCH /api/members/:id
  async updateMember(
    id: string,
    data: UpdateMemberPayload
  ): Promise<MemberResponse> {
    const response = await api.patch<MemberResponse>(
      `/members/${encodeURIComponent(id)}`,
      data
    );

    return response.data;
  },

  // PATCH /api/members/:id/status
  async updateMemberStatus(
    id: string,
    isActive: boolean
  ): Promise<MemberResponse> {
    const response = await api.patch<MemberResponse>(
      `/members/${encodeURIComponent(id)}/status`,
      { isActive }
    );

    return response.data;
  },
};

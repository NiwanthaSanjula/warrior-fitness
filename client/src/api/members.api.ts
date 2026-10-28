
import { api } from "./api";

import type {
  CreateMemberPayload,
  MemberListParams,
  MemberListResponse,
  MemberResponse,
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
};

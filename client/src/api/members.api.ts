
import { api } from "./api";

import type {
  MemberListParams,
  MemberListResponse,
} from "../types/member";

export const membersApi = {
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
    );

    return response.data;
  },
};

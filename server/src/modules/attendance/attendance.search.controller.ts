
import type { RequestHandler } from "express";
import { z } from "zod";

import { Member } from "../members/member.model.js";

const searchQuerySchema = z.strictObject({
  q: z.string().trim().min(2).max(80),
});

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// GET /api/attendance/member-search?q=...
export const searchAttendanceMembers: RequestHandler =
  async (req, res) => {
    const parsed = searchQuerySchema.safeParse(
      req.query
    );

    if (!parsed.success) {
      res.status(400).json({
        success: false,
        message: "Enter at least 2 search characters",
      });
      return;
    }

    const regex = new RegExp(
      escapeRegex(parsed.data.q),
      "i"
    );

    const members = await Member.find({
      $or: [
        { fullName: regex },
        { memberId: regex },
        { phone: regex },
      ],
    })
      .select("fullName memberId phone isActive")
      .sort({ fullName: 1, _id: 1 })
      .limit(10)
      .lean();

    res.status(200).json({
      success: true,
      data: members.map((member) => ({
        id: member._id.toString(),
        memberId: member.memberId,
        fullName: member.fullName,
        phone: member.phone,
        isActive: member.isActive,
      })),
    });
  };

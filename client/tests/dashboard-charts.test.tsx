import { fireEvent, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DashboardChart, MembershipDonut } from "../src/components/dashboard/DashboardCharts";
import CollectionsPanel from "../src/components/dashboard/CollectionsPanel";
import { completeSeries, membershipMix } from "../src/utils/dashboard-charts";
import type { DashboardResource } from "../src/hooks/useDashboardResource";
import { activityFixture, collectionsFixture, gymDate } from "./fixtures/dashboard";
import { commandRetail } from "./fixtures/command-center";
import { authState, renderWithAuth } from "./helpers/auth";

const from = collectionsFixture.period.from;
const rows = collectionsFixture.byDay.map(day => ({ date: day.date, value: day.totalCollectedLkr }));
const resource = <T,>(data: T): DashboardResource<T> => ({ state: { status: "success", data }, retry: vi.fn() });
describe("real-data chart presentation", () => {
  it("orders a complete ledger period without fabricating missing dates", () => {
    expect(completeSeries([...rows].reverse(), from, gymDate)).toEqual(rows);
    expect(() => completeSeries(rows.slice(1), from, gymDate)).toThrow();
    expect(() => completeSeries([rows[0], ...rows.slice(0, 6)], from, gymDate)).toThrow();
    expect(() => completeSeries([{ ...rows[0], date: "2025-01-01" }, ...rows.slice(1)], from, gymDate)).toThrow();
  });
  it.each([-1, 1.5, Number.MAX_SAFE_INTEGER + 1])("rejects unsafe chart amount %s", value => {
    expect(() => completeSeries([{ ...rows[0], value }, ...rows.slice(1)], from, gymDate)).toThrow();
  });
  it("provides distinct membership/POS series and exact accessible table values", () => {
    renderWithAuth(<CollectionsPanel membership={resource(collectionsFixture)} retail={resource(commandRetail)} from={from} to={gymDate} />, authState("ADMIN"));
    const table = within(screen.getByRole("table", { name: "7-day collections trend daily values" }));
    expect(table.getAllByRole("row")).toHaveLength(8);
    expect(table.getByRole("row", { name: "01 Nov 2026 LKR 12,500 LKR 2,500" })).toBeInTheDocument();
    expect(screen.getByText("LKR 20,000")).toBeInTheDocument(); expect(screen.getByText("LKR 5,500")).toBeInTheDocument();
    expect(screen.queryByText("LKR 999,999")).not.toBeInTheDocument();
    expect(screen.getByRole("img", { name: /7-day collections trend/ })).toBeInTheDocument();
  });
  it("keeps a successful trend usable when the other source fails, without substituting zero", () => {
    const retry = vi.fn();
    renderWithAuth(<CollectionsPanel membership={resource(collectionsFixture)} retail={{ state: { status: "error", message: "Fictional outage" }, retry }} from={from} to={gymDate} />, authState("ADMIN"));
    expect(screen.getByRole("alert")).toHaveTextContent("Fictional outage");
    expect(screen.getByText(/Showing membership only/)).toBeInTheDocument();
    expect(within(screen.getByRole("table")).queryByRole("columnheader", { name: "POS (LKR)" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry POS chart" })); expect(retry).toHaveBeenCalledOnce();
  });
  it("qualifies a known-zero series when the other ledger is unavailable", () => {
    const zero = { ...collectionsFixture, summary: { ...collectionsFixture.summary, totalCollectedLkr: 0 }, byDay: collectionsFixture.byDay.map(day => ({ ...day, totalCollectedLkr: 0 })) };
    renderWithAuth(<CollectionsPanel membership={resource(zero)} retail={{ state: { status: "error", message: "Fictional outage" }, retry: vi.fn() }} from={from} to={gymDate} />, authState("ADMIN"));
    expect(screen.getByText("No membership collections recorded in this period.")).toBeInTheDocument();
    expect(screen.queryByText("No collections recorded in this period.")).not.toBeInTheDocument();
    expect(screen.getByText(/Showing membership only/)).toBeInTheDocument();
  });
  it("rejects mismatched periods and contradictory totals locally while preserving the other series", () => {
    const membership = resource({ ...collectionsFixture, summary: { ...collectionsFixture.summary, totalCollectedLkr: 1 } });
    renderWithAuth(<CollectionsPanel membership={membership} retail={resource(commandRetail)} from={from} to={gymDate} />, authState("ADMIN"));
    expect(screen.getByRole("alert")).toHaveTextContent("Daily collections do not match");
    expect(screen.getByText(/Showing pos only/)).toBeInTheDocument(); expect(screen.queryByText("LKR 20,000")).not.toBeInTheDocument();
  });
  it("supports keyboard point inspection, data disclosure and genuine zero attendance", () => {
    renderWithAuth(<DashboardChart label="Visit test" kind="bar" series={[{ label: "Visits", color: "#60a5fa", data: rows.map(day => ({ ...day, value: 0 })) }]} />, authState("ADMIN"));
    const point = screen.getByRole("button", { name: "26 Oct 2026: Visits 0" });
    fireEvent.focus(point); expect(point).toHaveAttribute("aria-pressed", "true");
    const show = screen.getByRole("button", { name: "View data for Visit test" });
    expect(show).toHaveAttribute("aria-expanded", "false"); fireEvent.click(show);
    expect(screen.getByRole("button", { name: "Hide data for Visit test" })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("table", { name: "Visit test daily values" })).toBeVisible();
    expect(document.querySelectorAll("svg rect")).toHaveLength(7);
    expect([...document.querySelectorAll("svg rect")].every(bar => bar.getAttribute("height") === "0")).toBe(true);
  });
  it("shows purchase types rather than inventing an active/inactive member population", () => {
    const mix = membershipMix(activityFixture);
    renderWithAuth(<MembershipDonut mix={mix} plans={activityFixture.byPlan} />, authState("ADMIN"));
    expect(screen.getByRole("img", { name: "12 membership purchases: New 8, Renewals 4" })).toBeInTheDocument();
    expect(screen.getByText("Monthly")).toBeInTheDocument(); expect(screen.queryByText(/inactive/i)).not.toBeInTheDocument();
    expect(() => membershipMix({ ...activityFixture, byType: [{ enrollmentType: "INITIAL", purchases: 1 }] })).toThrow();
  });
  it("does not invent a donut for empty purchase activity", () => {
    renderWithAuth(<MembershipDonut mix={[]} plans={[]} />, authState("ADMIN"));
    expect(screen.getByText("No membership purchases in this period.")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "0 membership purchases: none" })).toBeInTheDocument();
  });
});

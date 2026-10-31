import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import App from "../src/App";
import { authState, renderWithAuth } from "./helpers/auth";

// Keep App's route tree, real guards, and AppLayout. Replace only leaf content.
vi.mock("../src/pages/LoginPage", () => ({ default: () => <h1>Login test page</h1> }));
vi.mock("../src/pages/DashboardPage", () => ({ default: () => <h1>Dashboard test page</h1> }));
vi.mock("../src/pages/ReportsPage", () => ({ default: () => <h1>Reports test page</h1> }));
vi.mock("../src/pages/MembersPage", () => ({ default: () => <h1>Members test page</h1> }));
vi.mock("../src/pages/BillingPage", () => ({ default: () => <h1>Payments test page</h1> }));
vi.mock("../src/pages/AttendancePage", () => ({ default: () => <h1>Attendance test page</h1> }));
vi.mock("../src/pages/PlansPage", () => ({ default: () => <h1>Plans test page</h1> }));
vi.mock("../src/pages/AttentionPage", () => ({ default: () => <h1>Attention test page</h1> }));
vi.mock("../src/pages/DueFollowUpsPage", () => ({ default: () => <h1>Follow-ups test page</h1> }));

describe("real application routes and existing guards", () => {
  it("redirects unauthenticated /reports access to login", async () => {
    renderWithAuth(<App />, authState(null), "/reports");
    expect(await screen.findByRole("heading", { name: "Login test page" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Reports test page" })).not.toBeInTheDocument();
  });

  it("redirects Receptionist /reports access to the permitted dashboard", async () => {
    renderWithAuth(<App />, authState("RECEPTIONIST"), "/reports");
    expect(await screen.findByRole("heading", { name: "Dashboard test page" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Reports test page" })).not.toBeInTheDocument();
  });

  it("allows an Admin to enter /reports", async () => {
    renderWithAuth(<App />, authState("ADMIN"), "/reports");
    expect(await screen.findByRole("heading", { name: "Reports test page" })).toBeInTheDocument();
  });

  it.each([
    ["/members", "Members test page"],
    ["/payments", "Payments test page"],
    ["/attendance", "Attendance test page"],
    ["/plans", "Plans test page"],
    ["/attention", "Attention test page"],
    ["/attention/follow-ups/due", "Follow-ups test page"],
  ])("keeps the existing %s operation accessible to Receptionists", async (path, heading) => {
    renderWithAuth(<App />, authState("RECEPTIONIST"), path);
    expect(await screen.findByRole("heading", { name: heading })).toBeInTheDocument();
  });

  it("holds protected content and redirects while authentication is loading", () => {
    renderWithAuth(<App />, authState(null, { loading: true }), "/reports");
    expect(screen.getByText("LOADING WARRIOR FITNESS...")).toBeInTheDocument();
    for (const name of ["Reports test page", "Dashboard test page", "Login test page"]) {
      expect(screen.queryByRole("heading", { name })).not.toBeInTheDocument();
    }
  });

  it.each(["ADMIN", "RECEPTIONIST"] as const)("redirects authenticated %s users away from login", async (role) => {
    renderWithAuth(<App />, authState(role), "/login");
    expect(await screen.findByRole("heading", { name: "Dashboard test page" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Login test page" })).not.toBeInTheDocument();
  });

  it("holds the public login route while authentication is loading", () => {
    renderWithAuth(<App />, authState("ADMIN", { loading: true }), "/login");
    expect(screen.getByText("LOADING WARRIOR FITNESS...")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Login test page" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Dashboard test page" })).not.toBeInTheDocument();
  });
});

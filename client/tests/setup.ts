import net from "node:net";
import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, beforeEach, expect, vi } from "vitest";

const blockedAttempts: string[] = [];

function forbidden(): never {
  blockedAttempts.push("unexpected network access");
  throw new Error("Network access is forbidden in component tests; mock the API boundary");
}

function installNetworkGuards() {
  vi.stubGlobal("fetch", vi.fn(forbidden));
  vi.stubGlobal("WebSocket", vi.fn(forbidden));
  vi.spyOn(XMLHttpRequest.prototype, "send").mockImplementation(forbidden);
  vi.spyOn(net.Socket.prototype, "connect").mockImplementation(forbidden);
}

installNetworkGuards();

beforeEach(() => {
  blockedAttempts.length = 0;
  installNetworkGuards();
});

afterEach(() => {
  cleanup();
  expect(blockedAttempts, "Component tests must not attempt live API access").toEqual([]);
});

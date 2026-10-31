import { createServer, type Server } from "node:http";
import type { Express } from "express";
import supertest from "supertest";

const servers = new Set<Server>();

// Only sockets belonging to these ephemeral Supertest servers are allowed.
export function testClient(app: Express) {
  const server = createServer(app);
  servers.add(server);
  return supertest(server);
}

export function isTestServerPort(port: number): boolean {
  return [...servers].some((server) => {
    const address = server.address();
    return address !== null && typeof address === "object" && address.port === port;
  });
}

export async function closeTestServers(): Promise<void> {
  await Promise.all([...servers].map((server) => new Promise<void>((resolve) => {
    if (!server.listening) return resolve();
    server.close(() => resolve());
  })));
  servers.clear();
}

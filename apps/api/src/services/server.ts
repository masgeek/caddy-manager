import type { Server } from "@caddy-manager/shared-types";
import { serverRepo, siteInventoryRepo } from "@caddy-manager/db";
import { NotFoundError } from "../lib/errors";

export async function listServers(): Promise<Server[]> {
  return serverRepo.findAll();
}

export async function getServer(id: string): Promise<Server> {
  const server = await serverRepo.findById(id);
  if (!server) throw new NotFoundError("Server", id);
  return server;
}

export async function createServer(data: {
  name: string;
  hostname: string;
  apiEndpoint: string;
}): Promise<Server> {
  return serverRepo.create(data);
}

export async function updateServer(
  id: string,
  data: Partial<{ name: string; hostname: string; apiEndpoint: string }>,
): Promise<Server> {
  const server = await serverRepo.update(id, data);
  if (!server) throw new NotFoundError("Server", id);
  return server;
}

export async function deleteServer(id: string): Promise<void> {
  await siteInventoryRepo.detachFromServer(
    id,
    "Server was deleted; inventory is not provisioned",
  );
  const deleted = await serverRepo.delete(id);
  if (!deleted) throw new NotFoundError("Server", id);
}

export async function updateServerStatus(
  id: string,
  status: string,
  version?: string,
): Promise<void> {
  await serverRepo.updateStatus(id, status, version);
}

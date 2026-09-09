import { serverRepo, siteGroupRepo } from "@caddy-manager/db";
import { ConflictError, NotFoundError } from "../lib/errors";

export async function listGroups(serverId?: string) {
  return siteGroupRepo.findAll(serverId);
}

export async function getGroup(id: string) {
  const group = await siteGroupRepo.findById(id);
  if (!group) throw new NotFoundError("Site group", id);
  return group;
}

export async function createGroup(data: {
  serverId: string;
  name: string;
  description?: string;
}) {
  if (!(await serverRepo.findById(data.serverId)))
    throw new NotFoundError("Server", data.serverId);
  if (await siteGroupRepo.findByNameAndServer(data.name, data.serverId))
    throw new ConflictError(
      `Group '${data.name}' already exists on this server`,
    );
  return siteGroupRepo.create(data);
}

export async function updateGroup(
  id: string,
  data: { name?: string; description?: string },
) {
  const group = await getGroup(id);
  if (data.name && data.name !== group.name) {
    if (await siteGroupRepo.findByNameAndServer(data.name, group.serverId))
      throw new ConflictError(
        `Group '${data.name}' already exists on this server`,
      );
  }
  const updated = await siteGroupRepo.update(id, data);
  if (!updated) throw new NotFoundError("Site group", id);
  return updated;
}

export async function deleteGroup(id: string) {
  const deleted = await siteGroupRepo.delete(id);
  if (!deleted) throw new NotFoundError("Site group", id);
}

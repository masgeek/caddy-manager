import { ApiClient } from "@caddy-manager/shared-api";

function createClient(): ApiClient {
  const saved = localStorage.getItem("token");
  return new ApiClient("/api", saved ?? undefined);
}

export let api: ApiClient = createClient();
let unauthorizedHandler: (() => void) | undefined;

api.setUnauthorizedHandler(unauthorizedHandler);

export function setApiClient(client: ApiClient) {
  client.setUnauthorizedHandler(unauthorizedHandler);
  api = client;
}

export function setUnauthorizedHandler(handler?: () => void) {
  unauthorizedHandler = handler;
  api.setUnauthorizedHandler(handler);
}

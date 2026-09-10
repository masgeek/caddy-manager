const baseUrl = (process.env.SMOKE_BASE_URL ?? "http://127.0.0.1:3500").replace(
  /\/$/,
  "",
);

async function check(path, predicate, description) {
  const response = await fetch(`${baseUrl}${path}`);
  const body = await response.text();
  if (!predicate(response, body)) {
    throw new Error(
      `${description} failed: ${response.status} ${body.slice(0, 200)}`,
    );
  }
  console.log(`${description}: ok`);
}

try {
  await check(
    "/api/health",
    (response, body) => response.ok && body.includes('"status"'),
    "API health",
  );
  await check(
    "/",
    (response, body) => response.ok && /<html/i.test(body),
    "Frontend serving",
  );
  await check(
    "/api/sites",
    (response) => response.status === 401,
    "Protected API boundary",
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}

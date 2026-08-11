import { permissionFor } from "./target.mjs";

const api = () => process.env["GITHUB_API_URL"] ?? "https://api.github.com";

const send = (token, method, path, body) =>
  fetch(`${api()}${path}`, {
    method,
    headers: {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      "user-agent": "nemolize/actions/upsert",
      "x-github-api-version": "2022-11-28",
    },
    body: body && JSON.stringify(body),
  });

const describe = (method, path, status, detail) => {
  const hints = {
    403: ` — the token needs \`${permissionFor(path.includes("/pulls/") ? "pulls" : "issues")}\``,
    422: /too long|size/i.test(detail) ? " — the resulting body is over GitHub's size limit" : "",
  };
  return new Error(`${method} ${path} responded ${status}${hints[status] ?? ""}: ${detail}`);
};

const request = async (token, method, path, body) => {
  const response = await send(token, method, path, body);
  if (!response.ok) throw describe(method, path, response.status, await response.text());
  return response.json();
};

export const detectCollection = async (token, repository, number) => {
  const path = `/repos/${repository}/pulls/${number}`;
  const response = await send(token, "GET", path);
  if (response.ok) return "pulls";
  if (response.status === 404) return "issues";
  throw describe("GET", path, response.status, await response.text());
};

export const readBody = async (token, repository, collection, number) => {
  const target = await request(token, "GET", `/repos/${repository}/${collection}/${number}`);
  return target.body ?? "";
};

export const writeBody = (token, repository, collection, number, body) =>
  request(token, "PATCH", `/repos/${repository}/${collection}/${number}`, { body });

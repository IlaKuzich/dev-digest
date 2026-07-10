import { describe, it, expect } from "vitest";
import { buildApp } from "../src/app.js";
import { loadConfig } from "../src/platform/config.js";

// SSRF tests — no DB required
describe("POST /skills/import-url SSRF protection (no DB)", () => {
  const config = loadConfig({
    ...process.env,
    NODE_ENV: "test",
  } as NodeJS.ProcessEnv);

  it("rejects localhost URLs → non-2xx error", async () => {
    const app = await buildApp({ config });
    const res = await app.inject({
      method: "POST",
      url: "/skills/import-url",
      payload: { url: "http://localhost/secret", name: "test" },
    });
    expect(res.statusCode).toBeGreaterThanOrEqual(400);
    expect(res.json().error.message).toMatch(/private|local|https/i);
    await app.close();
  });

  it("rejects 127.x.x.x IPs → non-2xx error", async () => {
    const app = await buildApp({ config });
    const res = await app.inject({
      method: "POST",
      url: "/skills/import-url",
      payload: { url: "http://127.0.0.1/file", name: "test" },
    });
    expect(res.statusCode).toBeGreaterThanOrEqual(400);
    await app.close();
  });

  it("rejects 10.x private IPs → non-2xx error", async () => {
    const app = await buildApp({ config });
    const res = await app.inject({
      method: "POST",
      url: "/skills/import-url",
      payload: { url: "http://10.0.0.1/file", name: "test" },
    });
    expect(res.statusCode).toBeGreaterThanOrEqual(400);
    await app.close();
  });

  it("rejects plain HTTP external URLs → non-2xx error", async () => {
    const app = await buildApp({ config });
    const res = await app.inject({
      method: "POST",
      url: "/skills/import-url",
      payload: { url: "http://example.com/skill.md", name: "test" },
    });
    expect(res.statusCode).toBeGreaterThanOrEqual(400);
    expect(res.json().error.message).toMatch(/https/i);
    await app.close();
  });

  it("rejects missing name → 422", async () => {
    const app = await buildApp({ config });
    const res = await app.inject({
      method: "POST",
      url: "/skills/import-url",
      payload: { url: "https://example.com/skill.md" },
    });
    expect(res.statusCode).toBe(422);
    await app.close();
  });
});

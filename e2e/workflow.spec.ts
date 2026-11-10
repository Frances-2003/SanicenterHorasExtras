import { test, expect, type Page, type APIRequestContext } from "@playwright/test";

const password = "SaniDemo2026!";
const marker = `UI-${Date.now()}`;
const day = (offset: number) => `2024-06-${String(10 + offset).padStart(2, "0")}`;
const flowUser = `QAANA${Date.now()}`;
const concurrencyUser = `QALUIS${Date.now()}`;
let externalFirebase: string[] = [];

test.beforeAll(async ({ request }) => {
  const health = await request.get("/api/local-health");
  expect(await health.json()).toEqual({ projectId: "demo-sanicenter", emulators: true });
  // Fresh local accounts make reruns independent, without deleting demo records or resetting counters.
  for (const username of [flowUser, concurrencyUser]) {
    const created = await request.post(
      "http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-sanicenter-local-key",
      {
        data: {
          email: `${username.toLowerCase()}@auth.sanicenter.invalid`,
          password,
          returnSecureToken: true,
        },
      },
    );
    expect(created.ok()).toBeTruthy();
    const { localId } = await created.json();
    const profile = await request.patch(
      `http://127.0.0.1:8085/v1/projects/demo-sanicenter/databases/(default)/documents/users/${localId}`,
      {
        headers: { Authorization: "Bearer owner" },
        data: {
          fields: {
            username: { stringValue: username },
            name: { stringValue: username },
            role: { stringValue: "trabajador" },
            area: { stringValue: "Almacen" },
            active: { booleanValue: true },
          },
        },
      },
    );
    expect(profile.ok()).toBeTruthy();
  }
});

test.beforeEach(async ({ page, request }) => {
  const health = await request.get("/api/local-health");
  expect(health.ok()).toBeTruthy();
  expect(await health.json()).toEqual({ projectId: "demo-sanicenter", emulators: true });
  externalFirebase = [];
  await page.route("**/*", (route) => {
    const url = new URL(route.request().url());
    if (
      ["127.0.0.1", "localhost"].includes(url.hostname) ||
      !["http:", "https:"].includes(url.protocol)
    )
      return route.continue();
    if (/firebase|identitytoolkit|securetoken|firestore/.test(url.hostname))
      externalFirebase.push(url.href);
    return route.abort();
  });
});
test.afterEach(() => expect(externalFirebase, "No requests to real Firebase").toEqual([]));

async function login(page: Page, username: string) {
  await page.goto("/");
  await page.getByLabel("Nombre de usuario").fill(username);
  await page.getByLabel("Contraseña", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Iniciar sesión" }).click();
  await expect(page.getByRole("button", { name: "Cerrar sesión" })).toBeVisible();
}
async function logout(page: Page) {
  await page.getByRole("button", { name: "Cerrar sesión" }).click();
  await expect(page.getByLabel("Nombre de usuario")).toBeVisible();
}
async function decide(page: Page, code: string, action: string) {
  if (new URL(page.url()).pathname === "/horas")
    await page.locator('input[placeholder="HE-000001"]').fill(code);
  else {
    const previous = page.getByRole("button", { name: "Anterior", exact: true });
    while (await previous.isEnabled()) await previous.click();
  }
  const row = page.getByRole("row").filter({ hasText: code });
  await expect
    .poll(async () => {
      if (await row.count()) return true;
      const next = page.getByRole("button", { name: "Siguiente", exact: true });
      if (await next.isEnabled()) await next.click();
      return false;
    })
    .toBe(true);
  await row.getByRole("button", { name: action, exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.locator("textarea").fill(`${marker}: ${action}`);
  await dialog.getByRole("button", { name: "Confirmar", exact: true }).click();
  await expect(dialog).not.toBeVisible();
}
async function createOvertime(
  page: Page,
  reason: string,
  date: string,
  start = "22:00",
  end = "02:00",
) {
  await page.goto("/horas");
  await page.locator("form input[type=date]").fill(date);
  await page.locator("form input[type=time]").nth(0).fill(start);
  await page.locator("form input[type=time]").nth(1).fill(end);
  await page.locator("form input[list=reasons]").fill(reason);
  const saved = page.waitForResponse(
    (r) => r.url().endsWith("/api/workflow") && r.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Solicitar aprobación" }).click();
  expect((await saved).ok()).toBeTruthy();
  const row = page.getByRole("row").filter({ hasText: reason });
  await expect(row).toContainText("Pendiente");
  return (await row.locator("td").first().innerText()).trim();
}
async function createComp(page: Page, sourceCode: string, reason: string, date: string) {
  await page.goto("/compensaciones");
  await page.locator("input[type=date]").first().fill(date);
  await page.locator("input[type=time]").nth(0).fill("08:00");
  await page.locator("input[type=time]").nth(1).fill("09:00");
  await page.locator('input[placeholder^="Ej. Cita"]').fill(reason);
  await page.getByRole("checkbox", { name: `Seleccionar ${sourceCode}`, exact: true }).check();
  const saved = page.waitForResponse(
    (r) => r.url().endsWith("/api/workflow") && r.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Enviar solicitud" }).click();
  expect((await saved).ok()).toBeTruthy();
  const row = page.getByRole("row").filter({ hasText: reason });
  await expect(row).toContainText("Pendiente");
  return (await row.locator("td").first().innerText()).trim();
}
async function token(request: APIRequestContext, username: string) {
  const response = await request.post(
    "http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-sanicenter-local-key",
    {
      data: {
        email: `${username.toLowerCase()}@auth.sanicenter.invalid`,
        password,
        returnSecureToken: true,
      },
    },
  );
  expect(response.ok()).toBeTruthy();
  return (await response.json()).idToken as string;
}
async function command(
  request: APIRequestContext,
  bearer: string,
  data: unknown,
  requestId = crypto.randomUUID(),
) {
  const response = await request.post("/api/workflow", {
    headers: { Authorization: `Bearer ${bearer}`, "X-Request-Id": requestId },
    data,
  });
  return { status: response.status(), data: await response.json() };
}

test("UI: overtime approval/rejection, compensation rejection, cancellation refund and manual rest", async ({
  page,
}) => {
  test.setTimeout(180000);
  await login(page, flowUser);
  const ot = await createOvertime(page, `${marker}-approved`, day(0));
  const rejectedOt = await createOvertime(page, `${marker}-rejected`, day(2), "18:00", "19:00");
  const voidOt = await createOvertime(page, `${marker}-void`, day(6), "18:00", "19:00");
  await expect(page.getByRole("button", { name: "Aprobar", exact: true })).toHaveCount(0);
  await logout(page);
  await login(page, "JEFE");
  await page.goto("/horas");
  await decide(page, ot, "Aprobar");
  await expect(page.getByRole("row").filter({ hasText: ot })).toContainText("Aprobada");
  await decide(page, rejectedOt, "Rechazar");
  await expect(page.getByRole("row").filter({ hasText: rejectedOt })).toContainText("Rechazada");
  await decide(page, voidOt, "Aprobar");
  await decide(page, voidOt, "Anular");
  await expect(page.getByRole("row").filter({ hasText: voidOt })).toContainText("Anulada");
  await logout(page);
  await login(page, flowUser);
  const cancelled = await createComp(
    page,
    ot,
    `${marker}-cancel`,
    new Date(Date.now() + 10 * 86400000).toISOString().slice(0, 10),
  );
  await logout(page);
  await login(page, "JEFE");
  await page.goto("/solicitudes");
  await decide(page, cancelled, "Aprobar");
  await logout(page);
  await login(page, flowUser);
  await page.goto("/compensaciones");
  const balance = () =>
    page.getByText("Saldo disponible actual", { exact: true }).locator("..").locator("div").last();
  // Overtime and compensation listeners arrive independently after login.
  // Read the baseline only once the known 4h source and 1h approved rest are both reflected.
  await expect(page.getByRole("row").filter({ hasText: cancelled })).toContainText("Aprobada");
  await expect(balance()).toHaveText("3h 00m");
  const before = await balance().innerText();
  await decide(page, cancelled, "Solicitar anulación");
  await expect(page.getByRole("row").filter({ hasText: cancelled })).toContainText(
    "Anulación pendiente",
  );
  expect(await balance().innerText()).toBe(before);
  await logout(page);
  await login(page, "JEFE");
  await page.goto("/solicitudes");
  await page.getByRole("button", { name: "Todas", exact: true }).click();
  await decide(page, cancelled, "Denegar anulación");
  await expect(page.getByRole("row").filter({ hasText: cancelled })).toContainText("Aprobada");
  await logout(page);
  await login(page, flowUser);
  await page.goto("/compensaciones");
  await decide(page, cancelled, "Solicitar anulación");
  await logout(page);
  await login(page, "JEFE");
  await page.goto("/solicitudes");
  await page.getByRole("button", { name: "Todas", exact: true }).click();
  await decide(page, cancelled, "Autorizar anulación");
  await expect(page.getByRole("row").filter({ hasText: cancelled })).toContainText("Anulada");
  await logout(page);
  await login(page, flowUser);
  await page.goto("/compensaciones");
  const toMinutes = (text: string) => {
    const values = text.match(/(\d+)h\s*(\d+)m/);
    if (!values) throw new Error(`Saldo ilegible: ${text}`);
    return Number(values[1]) * 60 + Number(values[2]);
  };
  await expect
    .poll(async () => toMinutes(await balance().innerText()))
    .toBe(toMinutes(before) + 60);
  const rejected = await createComp(page, ot, `${marker}-reject-comp`, day(4));
  await logout(page);
  await login(page, "JEFE");
  await page.goto("/solicitudes");
  await decide(page, rejected, "Rechazar");
  await logout(page);
  await login(page, flowUser);
  await page.goto("/compensaciones");
  await expect(page.getByRole("row").filter({ hasText: rejected })).toContainText("Rechazada");
  const effected = await createComp(page, ot, `${marker}-effected`, day(5));
  await logout(page);
  await login(page, "ADMIN");
  await page.goto("/solicitudes");
  await decide(page, effected, "Aprobar");
  await page.getByRole("button", { name: "Todas", exact: true }).click();
  await decide(page, effected, "Confirmar descanso realizado");
  await expect(page.getByRole("row").filter({ hasText: effected })).toContainText("Efectuada");
  await page.goto("/resumen");
  await expect(page.getByRole("heading", { name: "Resumen", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Calendario de compensaciones" })).toBeVisible();
  await page.screenshot({ path: "test-results/resumen-admin.png", fullPage: true });
});

test("UI: roles, other areas, inactive accounts and shared colleague calendar", async ({
  page,
}) => {
  await login(page, "JEFE");
  await page.goto("/horas");
  await expect(page.getByRole("row").filter({ hasText: "HE-001004" })).toHaveCount(0);
  await page.goto("/admin");
  await expect(page.getByText("No tienes acceso a esta sección con tu rol actual.")).toBeVisible();
  await logout(page);
  await login(page, "JEFEVENTAS");
  await page.goto("/horas");
  await expect(page.getByRole("row").filter({ hasText: "HE-001004" })).toBeVisible();
  await expect(page.getByRole("row").filter({ hasText: "HE-001001" })).toHaveCount(0);
  await logout(page);
  await login(page, "ADMIN");
  await page.goto("/admin");
  await expect(page.getByRole("row").filter({ hasText: "Inactivo Demo" })).toBeVisible();
  await logout(page);
  await login(page, "ANA");
  await page.goto("/solicitudes");
  await expect(page.getByText("No tienes acceso a esta sección con tu rol actual.")).toBeVisible();
  await page.goto("/compensaciones");
  const future = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
  await page.locator("input[type=date]").fill(future);
  await expect(page.getByText(/Luis Demo tiene un descanso aprobado/)).toBeVisible();
  await page.goto("/resumen");
  await page.locator("input[type=month]").fill(future.slice(0, 7));
  await page.getByRole("button", { name: new RegExp(`^${Number(future.slice(8))}$`) }).click();
  await expect(page.getByText("Luis Demo", { exact: true })).toBeVisible();
  await logout(page);
  await page.getByLabel("Nombre de usuario").fill("INACTIVO");
  await page.getByLabel("Contraseña", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Iniciar sesión" }).click();
  await expect(page.getByText("Tu cuenta no está autorizada para ingresar.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Cerrar sesión" })).toHaveCount(0);
});

test("HTTP + Auth emulator: denied self-approval, foreign area, inactive, forged role, no-token", async ({
  request,
}) => {
  const worker = await token(request, "ANA"),
    boss = await token(request, "JEFEVENTAS"),
    inactive = await token(request, "INACTIVO");
  const review = {
    action: "reviewOvertime",
    id: "demo-ot-pending",
    approve: true,
    note: "Intento no autorizado",
  };
  expect((await command(request, worker, review)).status).toBe(400);
  expect((await command(request, boss, review)).status).toBe(400);
  expect((await command(request, inactive, review)).status).toBe(400);
  expect((await command(request, worker, { ...review, role: "admin" })).status).toBe(400);
  expect((await request.post("/api/workflow", { data: review })).status()).toBe(401);
  expect((await command(request, "invalid-token", review)).status).toBe(401);
  const sameArea = await token(request, "JEFE");
  const premature = await command(request, sameArea, {
    action: "confirmRest",
    id: "demo-cp-luis",
    note: "Todavía no realizado",
  });
  expect(premature.status).toBe(400);
  expect(premature.data.error).toContain("terminado");
  const direct = await request.patch(
    "http://127.0.0.1:8085/v1/projects/demo-sanicenter/databases/(default)/documents/users/local-ana?updateMask.fieldPaths=role",
    {
      headers: { Authorization: `Bearer ${worker}` },
      data: { fields: { role: { stringValue: "admin" } } },
    },
  );
  expect(direct.status()).toBe(403);
});

test("HTTP + Auth emulator: concurrent overnight inserts, consecutive codes, retry idempotency and balance reservations", async ({
  request,
}) => {
  const worker = await token(request, concurrencyUser),
    boss = await token(request, "JEFE");
  const data = {
    action: "addOvertime",
    date: day(0),
    start: "23:00",
    end: "02:00",
    reason: `${marker}-concurrent`,
  };
  const requestId = crypto.randomUUID();
  const attempts = await Promise.all([
    command(request, worker, data, requestId),
    command(request, worker, { ...data, date: day(1), start: "01:00", end: "03:00" }),
  ]);
  expect(attempts.map((a) => a.status).sort()).toEqual([200, 400]);
  expect(attempts.find((a) => a.status === 400)?.data.error).toContain("superpone");
  // Retry whichever first request succeeded; never assume an ordering for concurrent commits.
  const success = attempts.find((a) => a.status === 200)!;
  if (attempts[0]!.status === 200)
    expect((await command(request, worker, data, requestId)).data).toEqual(success.data);
  const second = await command(request, worker, {
    ...data,
    date: day(2),
    start: "18:00",
    end: "19:00",
  });
  expect(second.status).toBe(200);
  const read = async (id: string) =>
    (
      await (
        await request.get(
          `http://127.0.0.1:8085/v1/projects/demo-sanicenter/databases/(default)/documents/overtime/${id}`,
          { headers: { Authorization: `Bearer ${worker}` } },
        )
      ).json()
    ).fields;
  const firstFields = await read(success.data.id),
    secondFields = await read(second.data.id);
  expect(Number(secondFields.code.stringValue.split("-")[1])).toBe(
    Number(firstFields.code.stringValue.split("-")[1]) + 1,
  );
  expect(
    (
      await command(request, boss, {
        action: "reviewOvertime",
        id: success.data.id,
        approve: true,
        note: "Verificado",
      })
    ).status,
  ).toBe(200);
  const minutes = Number(firstFields.minutes.integerValue);
  const rest = {
    action: "requestCompensation",
    date: day(4),
    start: "08:00",
    end: minutes === 180 ? "11:00" : "10:00",
    reason: "Reserva concurrente",
    allocations: [{ overtimeId: success.data.id, minutes }],
  };
  const comps = await Promise.all([
    command(request, worker, rest),
    command(request, worker, { ...rest, date: day(5) }),
  ]);
  expect(comps.map((a) => a.status).sort()).toEqual([200, 400]);
  expect(comps.find((a) => a.status === 400)?.data.error).toContain("saldo disponible");
});

test("UI: stopping local health blocks saving and never falls back to real Firebase", async ({
  page,
}) => {
  await login(page, "ANA");
  await page.goto("/horas");
  await page.route("**/api/local-health", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ ok: false }),
    }),
  );
  let writes = 0;
  page.on("request", (r) => {
    if (r.url().endsWith("/api/workflow")) writes++;
  });
  await page.locator("form input[type=date]").fill(day(6));
  await page.locator("form input[list=reasons]").fill("Debe bloquearse");
  await page.getByRole("button", { name: "Solicitar aprobación" }).click();
  await expect(page.getByText(/No se pudo confirmar la operación/)).toBeVisible();
  expect(writes).toBe(0);
});

test("UI: dashboard permissions, authorized areas, actual indicators and empty periods", async ({
  page,
}) => {
  await login(page, "ANA");
  await expect(page.getByRole("link", { name: "Dashboard", exact: true })).toHaveCount(0);
  await page.goto("/dashboard");
  await expect(page.getByText("No tienes acceso a esta sección con tu rol actual.")).toBeVisible();
  await expect(page.getByLabel("Desde", { exact: true })).toHaveCount(0);
  await logout(page);
  await login(page, "JEFE");
  await page.getByRole("link", { name: "Dashboard", exact: true }).click();
  await expect(page.getByLabel("Área", { exact: true }).locator("option")).toHaveText([
    "Todas las áreas autorizadas",
    "Almacen",
  ]);
  await expect(page.getByRole("row").filter({ hasText: "Maria Demo" })).toHaveCount(0);
  await page.getByLabel("Desde", { exact: true }).fill("2099-01");
  await page.getByLabel("Hasta", { exact: true }).fill("2099-12");
  await expect(
    page.getByText("Sin horas aprobadas en este período.", { exact: true }),
  ).toBeVisible();
  await page.getByLabel("Desde", { exact: true }).fill("2100-01");
  await expect(
    page.getByText("El inicio del período debe ser anterior o igual al final."),
  ).toBeVisible();
  await logout(page);
  await login(page, "JEFEMULTI");
  await page.goto("/dashboard");
  await expect(page.getByLabel("Área", { exact: true }).locator("option")).toHaveText([
    "Todas las áreas autorizadas",
    "Almacen",
    "Ventas",
  ]);
  await page.getByLabel("Área", { exact: true }).selectOption("Ventas");
  await expect(page.getByRole("row").filter({ hasText: "Maria Demo" })).toBeVisible();
  await expect(page.getByRole("row").filter({ hasText: "Ana Demo" })).toHaveCount(0);
  const card = (label: string) =>
    page.getByText(label, { exact: true }).locator("..").locator("div").last();
  await expect(card("Horas extras aprobadas")).toHaveText("0h 00m");
  await expect(card("Solicitudes pendientes")).toHaveText("1");
  await logout(page);
  await login(page, "ADMIN");
  await page.goto("/dashboard");
  await expect(
    page.getByRole("heading", { name: "Evolución mensual de horas extras aprobadas" }),
  ).toBeVisible();
  await expect(page.locator(".recharts-wrapper")).toHaveCount(3);
  await expect(page.locator(".recharts-pie-sector").first()).toBeVisible();
  await page.screenshot({ path: "test-results/dashboard-admin.png", fullPage: true });
});

test("UI: direct manager annulment refunds dashboard once and removes calendar entry", async ({
  page,
  request,
}) => {
  const worker = await token(request, flowUser),
    boss = await token(request, "JEFE");
  const overtime = await command(request, worker, {
    action: "addOvertime",
    date: day(8),
    start: "18:00",
    end: "20:00",
    reason: `${marker}-direct-source`,
  });
  expect(overtime.status).toBe(200);
  expect(
    (
      await command(request, boss, {
        action: "reviewOvertime",
        id: overtime.data.id,
        approve: true,
        note: "Verificado",
      })
    ).status,
  ).toBe(200);
  const comp = await command(request, worker, {
    action: "requestCompensation",
    date: new Date(Date.now() + 12 * 86400000).toISOString().slice(0, 10),
    start: "10:00",
    end: "11:00",
    reason: `${marker}-direct-annul`,
    allocations: [{ overtimeId: overtime.data.id, minutes: 60 }],
  });
  expect(comp.status).toBe(200);
  expect(
    (
      await command(request, boss, {
        action: "reviewCompensation",
        id: comp.data.id,
        approve: true,
        note: "Autorizado",
      })
    ).status,
  ).toBe(200);
  const docUrl = `http://127.0.0.1:8085/v1/projects/demo-sanicenter/databases/(default)/documents/compensations/${comp.data.id}`;
  const saved = await (
    await request.get(docUrl, { headers: { Authorization: `Bearer ${worker}` } })
  ).json();
  const code = saved.fields.code.stringValue;
  await login(page, "JEFE");
  await page.goto("/dashboard");
  const balance = () =>
    page
      .getByText("Saldo disponible histórico", { exact: true })
      .locator("..")
      .locator("div")
      .last();
  const toMinutes = (text: string) => {
    const values = text.match(/(\d+)h\s*(\d+)m/);
    if (!values) throw new Error(text);
    return Number(values[1]) * 60 + Number(values[2]);
  };
  await expect(balance()).toBeVisible();
  // Wait for personnel/records instead of reading the initial empty observer snapshot.
  await expect(page.getByRole("row").filter({ hasText: "Ana Demo" })).toBeVisible();
  const before = toMinutes(await balance().innerText());
  await page.goto("/solicitudes");
  await page.getByRole("button", { name: "Todas", exact: true }).click();
  await decide(page, code, "Anular compensación");
  await expect(page.getByRole("row").filter({ hasText: code })).toContainText("Anulada");
  await page.goto("/dashboard");
  await expect.poll(async () => toMinutes(await balance().innerText())).toBe(before + 60);
  const duplicate = await command(request, boss, {
    action: "reviewCancellation",
    id: comp.data.id,
    approve: true,
    direct: true,
    note: "Reintento distinto",
  });
  expect(duplicate.status).toBe(400);
  expect(
    (
      await request.get(
        `http://127.0.0.1:8085/v1/projects/demo-sanicenter/databases/(default)/documents/calendar/${comp.data.id}`,
        { headers: { Authorization: `Bearer ${worker}` } },
      )
    ).status(),
  ).toBe(403);
  const result = await (
    await request.get(docUrl, { headers: { Authorization: `Bearer ${worker}` } })
  ).json();
  expect(result.fields.status.stringValue).toBe("anulada");
  expect(result.fields.voidReason.stringValue).toContain("Anular compensación");
  await logout(page);
  await login(page, "ANA");
  await page.goto("/compensaciones");
  const past = page.getByRole("row").filter({ hasText: "CP-000102" });
  await expect(past).toBeVisible();
  await expect(past.getByRole("button", { name: "Solicitar anulación" })).toHaveCount(0);
});

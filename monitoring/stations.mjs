import { createHash, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { authorize } from "./protocol.mjs";

const validId = (value) =>
  typeof value === "string" && /^[a-zA-Z0-9_-]{1,64}$/.test(value);
const assets = new Map(
  [
    ["/stations/", ["stations.html", "text/html; charset=utf-8"]],
    ["/stations/stations.css", ["stations.css", "text/css; charset=utf-8"]],
    [
      "/stations/stations.js",
      ["stations.js", "text/javascript; charset=utf-8"],
    ],
  ].map(([path, [file, type]]) => [
    path,
    { type, body: readFileSync(new URL(file, import.meta.url)) },
  ]),
);

export async function importLegacyStations(pool, registry) {
  if (!registry || typeof registry !== "object" || Array.isArray(registry))
    throw new Error("Invalid stations.json");
  for (const [id, value] of Object.entries(registry)) {
    if (
      !validId(id) ||
      !/^[a-f0-9]{64}$/.test(value?.sha256 || "") ||
      (value.synthetic !== undefined && typeof value.synthetic !== "boolean")
    )
      throw new Error("Invalid stations.json entry");
    // A restart must never overwrite a rotated token or re-enable a blocked station.
    await pool.query(
      "INSERT INTO station_credentials (station_id,name,sha256,synthetic) VALUES ($1,$1,$2,$3) ON CONFLICT DO NOTHING",
      [id, value.sha256, value.synthetic === true],
    );
  }
}

export async function stationIdentity(pool, id, authorization) {
  if (
    !validId(id) ||
    !/^Bearer [a-zA-Z0-9_-]{32,256}$/.test(authorization || "")
  )
    return null;
  const { rows } = await pool.query(
    "SELECT sha256,synthetic FROM station_credentials WHERE station_id=$1 AND enabled=true",
    [id],
  );
  return authorize({ [id]: rows[0] }, id, authorization);
}

export function stationHandler({ pool, publicUrl, fetchImpl = fetch }) {
  const origin = new URL(publicUrl).origin;
  return async (request, response) => {
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("X-Content-Type-Options", "nosniff");
    const json = (status, data) =>
      response
        .writeHead(status, { "Content-Type": "application/json" })
        .end(JSON.stringify(data));
    const asset = assets.get(request.url);
    if (asset && request.method === "GET") {
      response.setHeader(
        "Content-Security-Policy",
        "default-src 'self'; script-src 'self'; style-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
      );
      response.writeHead(200, { "Content-Type": asset.type }).end(asset.body);
      return;
    }
    if (request.url !== "/monitoring/admin/stations")
      return json(404, { message: "Nie znaleziono strony." });
    if (!["GET", "POST"].includes(request.method))
      return json(405, { message: "Niedozwolona metoda." });
    if (
      request.method === "POST" &&
      (request.headers.origin !== origin ||
        request.headers["content-type"]?.split(";")[0] !== "application/json")
    )
      return json(403, { message: "Niedozwolone źródło żądania." });
    if (!request.headers.cookie)
      return json(401, { message: "Zaloguj się przez LDAP." });
    let user;
    try {
      const auth = await fetchImpl("http://grafana:3000/api/user", {
        headers: { Cookie: request.headers.cookie },
        redirect: "error",
        signal: AbortSignal.timeout(5000),
      });
      if (!auth.ok) {
        if ([401, 403].includes(auth.status))
          return json(401, { message: "Sesja wygasła. Zaloguj się ponownie." });
        return json(503, {
          message: "Grafana jest chwilowo niedostępna. Spróbuj ponownie.",
        });
      }
      user = await auth.json();
    } catch {
      return json(503, {
        message: "Nie można sprawdzić sesji w Grafanie. Spróbuj ponownie.",
      });
    }
    if (
      user?.orgId !== 1 ||
      user.isDisabled ||
      user.isExternal !== true ||
      typeof user.login !== "string" ||
      !user.login ||
      !Array.isArray(user.authLabels) ||
      !user.authLabels.some(
        (label) => typeof label === "string" && label.toLowerCase() === "ldap",
      )
    )
      return json(403, {
        message: "Zarządzanie stanowiskami jest dostępne tylko dla IT.",
      });
    try {
      if (request.method === "GET") {
        const { rows } = await pool.query(
          "SELECT c.station_id,c.name,c.enabled,c.synthetic,c.updated_at,s.last_seen FROM station_credentials c LEFT JOIN stations s USING(station_id) ORDER BY lower(c.name),c.station_id",
        );
        return json(200, { stations: rows });
      }
      let size = 0;
      const chunks = [];
      for await (const chunk of request) {
        size += chunk.length;
        if (size > 16384)
          return json(413, { message: "Żądanie jest za duże." });
        chunks.push(chunk);
      }
      let input;
      try {
        input = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      } catch {
        return json(400, { message: "Nieprawidłowe dane." });
      }
      if (
        !input ||
        !validId(input.stationId) ||
        !["create", "rotate", "block"].includes(input.action) ||
        (input.action === "create" &&
          (typeof input.name !== "string" ||
            !input.name.trim() ||
            input.name.length > 255))
      )
        return json(400, {
          message:
            "Podaj nazwę oraz identyfikator: 1–64 litery, cyfry, myślniki lub podkreślenia.",
        });
      const token =
        input.action === "block" ? null : randomBytes(32).toString("hex");
      const hash = token
        ? createHash("sha256").update(token).digest("hex")
        : null;
      const client = await pool.connect();
      let synthetic = false;
      try {
        await client.query("BEGIN");
        let result;
        if (input.action === "create")
          result = await client.query(
            "INSERT INTO station_credentials (station_id,name,sha256) VALUES ($1,$2,$3) RETURNING station_id,synthetic",
            [input.stationId, input.name.trim(), hash],
          );
        else if (input.action === "rotate")
          result = await client.query(
            "UPDATE station_credentials SET sha256=$2,enabled=true,updated_at=now() WHERE station_id=$1 RETURNING station_id,synthetic",
            [input.stationId, hash],
          );
        else
          result = await client.query(
            "UPDATE station_credentials SET enabled=false,updated_at=now() WHERE station_id=$1 RETURNING station_id,synthetic",
            [input.stationId],
          );
        if (!result.rowCount) {
          await client.query("ROLLBACK");
          return json(404, { message: "Stanowisko nie istnieje." });
        }
        synthetic = result.rows[0].synthetic;
        await client.query(
          "INSERT INTO station_management_events (actor,action,station_id) VALUES ($1,$2,$3)",
          [user.login, input.action, input.stationId],
        );
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK").catch(() => undefined);
        throw error;
      } finally {
        client.release();
      }
      return json(200, {
        stationId: input.stationId,
        ...(token
          ? {
              configuration: {
                url: origin,
                stationId: input.stationId,
                token,
                synthetic,
              },
            }
          : {}),
      });
    } catch (error) {
      return json(error.code === "23505" ? 409 : 503, {
        message:
          error.code === "23505"
            ? "Taki identyfikator już istnieje. Wybierz inny."
            : "Nie udało się zapisać lub odczytać stanowisk. Spróbuj ponownie.",
      });
    }
  };
}

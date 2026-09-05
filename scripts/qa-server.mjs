// Local-only PostgREST subset backed by real PostgreSQL (PGlite).
// Never imported by the application or used with production credentials.
import http from "node:http";
import { createQaDatabase, recruitmentId } from "./qa-database.mjs";
const db = await createQaDatabase();
const ident = (value) => {
  if (!/^[a-z_][a-z_0-9]*$/i.test(value))
    throw new Error("Unsupported SQL identifier");
  return '"' + value + '"';
};
const tables = new Set(
  (
    await db.query(
      "select table_name from information_schema.tables where table_schema='public'",
    )
  ).rows.map((r) => r.table_name),
);
const functions = new Set([
  "save_review",
  "save_interview_note",
  "save_final_decision",
  "commit_applicant_import",
]);
const server = http.createServer(async (req, res) => {
  try {
    if (req.headers.apikey !== "local-qa-only") {
      res.writeHead(401);
      res.end("{}");
      return;
    }
    const url = new URL(req.url, "http://127.0.0.1:54329");
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = chunks.length
      ? JSON.parse(Buffer.concat(chunks).toString())
      : null;
    let rows = [];
    if (url.pathname.startsWith("/rest/v1/rpc/")) {
      const name = url.pathname.split("/").pop();
      if (!functions.has(name)) throw new Error("Unknown function");
      const keys = Object.keys(body),
        values = keys.map((k) =>
          typeof body[k] === "object" && body[k] !== null
            ? JSON.stringify(body[k])
            : body[k],
        );
      const query = `select ${ident(name)}(${keys.map((k, i) => ident(k) + "=> $" + (i + 1)).join(",")}) result`;
      const result = await db.query(query, values);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(result.rows[0].result));
      return;
    }
    const table = url.pathname.split("/").pop();
    if (!tables.has(table)) throw new Error("Unknown table");
    const params = [],
      where = [];
    const bind = (value) => {
      params.push(value);
      return "$" + params.length;
    };
    for (const [key, value] of url.searchParams) {
      if (
        [
          "select",
          "order",
          "on_conflict",
          "limit",
          "offset",
          "columns",
        ].includes(key)
      )
        continue;
      if (value.startsWith("eq."))
        where.push(ident(key) + " = " + bind(value.slice(3)));
      else if (value.startsWith("in.(")) {
        const values = value
          .slice(4, -1)
          .split(",")
          .map((x) => x.replace(/^"|"$/g, ""));
        where.push(ident(key) + " in (" + values.map(bind).join(",") + ")");
      } else throw new Error("Unsupported filter: " + value);
    }
    const condition = where.length ? " where " + where.join(" and ") : "";
    const selection = (url.searchParams.get("select") ?? "*")
      .split(",")
      .map((x) => (x === "*" ? "*" : ident(x)))
      .join(",");
    if (req.method === "GET") {
      const order = url.searchParams.get("order");
      const orderSql = order
        ? " order by " +
          order
            .split(",")
            .map((x) => {
              const [key, direction] = x.split(".");
              return ident(key) + (direction === "desc" ? " desc" : " asc");
            })
            .join(",")
        : "";
      const limit = Number(url.searchParams.get("limit") ?? 10000),
        offset = Number(url.searchParams.get("offset") ?? 0);
      rows = (
        await db.query(
          `select ${selection} from ${ident(table)}${condition}${orderSql} limit ${bind(limit)} offset ${bind(offset)}`,
          params,
        )
      ).rows;
    } else if (req.method === "DELETE")
      rows = (
        await db.query(
          `delete from ${ident(table)}${condition} returning *`,
          params,
        )
      ).rows;
    else if (req.method === "PATCH") {
      const setters = Object.entries(body).map(
        ([k, v]) => ident(k) + "=" + bind(v),
      );
      rows = (
        await db.query(
          `update ${ident(table)} set ${setters.join(",")}${condition} returning *`,
          params,
        )
      ).rows;
    } else if (req.method === "POST") {
      const input = Array.isArray(body) ? body : [body];
      await db.transaction(async (tx) => {
        for (const item of input) {
          const keys = Object.keys(item),
            values = keys.map((k) =>
              item[k] && typeof item[k] === "object" && !Array.isArray(item[k])
                ? JSON.stringify(item[k])
                : item[k],
            );
          // jsonb columns accept JSON strings; text[] columns accept arrays.
          for (const [i, key] of keys.entries())
            if (
              [
                "interests",
                "recommended_questions",
                "source_data",
                "extra_fields",
                "manifest",
              ].includes(key)
            )
              values[i] = JSON.stringify(item[key]);
          const conflict = url.searchParams.get("on_conflict");
          const upsert =
            conflict &&
            String(req.headers.prefer).includes("resolution=merge-duplicates")
              ? " on conflict (" +
                conflict.split(",").map(ident).join(",") +
                ") do update set " +
                keys.map((k) => ident(k) + "=excluded." + ident(k)).join(",")
              : "";
          rows.push(
            ...(
              await tx.query(
                `insert into ${ident(table)}(${keys.map(ident).join(",")}) values(${values.map((_, i) => "$" + (i + 1)).join(",")})${upsert} returning *`,
                values,
              )
            ).rows,
          );
        }
      });
    } else throw new Error("Unsupported method");
    if (
      String(req.headers.accept).includes("application/vnd.pgrst.object+json")
    ) {
      if (rows.length !== 1) {
        res.writeHead(406, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            code: "PGRST116",
            message: "Expected one row",
            details: `The result contains ${rows.length} rows`,
          }),
        );
        return;
      }
      rows = rows[0];
    }
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(rows));
  } catch (error) {
    console.error(error.message);
    res.writeHead(error.code === "40001" ? 409 : 400, {
      "Content-Type": "application/json",
    });
    res.end(
      JSON.stringify({ code: error.code ?? "QA", message: error.message }),
    );
  }
});
server.listen(54329, "127.0.0.1", () =>
  console.log(
    `Local QA PostgreSQL API ready on 127.0.0.1:54329; recruitment ${recruitmentId}`,
  ),
);
process.on("SIGINT", () =>
  server.close(async () => {
    await db.close();
    process.exit(0);
  }),
);

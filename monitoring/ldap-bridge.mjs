import { createServer } from "node:net";
import { connect } from "node:tls";
import { readFile, writeFile } from "node:fs/promises";
import { ldapConfig } from "./ldap-config.mjs";

const config = ldapConfig(process.env);
if (config.caPath) config.tlsOptions.ca = await readFile(config.caPath, "utf8");
await writeFile("/ldap/ldap.toml", config.toml, { mode: 0o644 });

const server = createServer((socket) => {
  socket.pause();
  const upstream = connect(config.tlsOptions);
  const deadline = setTimeout(() => upstream.destroy(), config.connectTimeout);
  const close = () => {
    clearTimeout(deadline);
    socket.destroy();
    upstream.destroy();
  };
  socket.on("error", close);
  upstream.on("error", close);
  socket.on("close", close);
  upstream.on("close", close);
  upstream.once("secureConnect", () => {
    clearTimeout(deadline);
    socket.setTimeout(config.operationTimeout, close);
    upstream.setTimeout(config.operationTimeout, close);
    socket.pipe(upstream).pipe(socket);
  });
});
server.maxConnections = 100;
server.listen(1389, "0.0.0.0");

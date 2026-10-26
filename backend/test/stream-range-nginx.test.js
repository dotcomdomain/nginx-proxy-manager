import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import dgram from "node:dgram";
import { once } from "node:events";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import net from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { Liquid } from "liquidjs";
import { streamPortBindings } from "../lib/stream-ports.js";

const modulePath = "/usr/lib/nginx/modules/ngx_stream_module.so";
const available = process.platform === "linux" && existsSync(modulePath) && spawnSync("nginx", ["-v"]).status === 0;

test("live Nginx forwards both ends of translated and fixed-port ranges over TCP and UDP", {
	skip: available ? false : "Requires Linux nginx and libnginx-mod-stream",
	timeout: 20000,
}, async () => {
	const dir = await mkdtemp(path.join(tmpdir(), "npm-stream-ranges-"));
	const upstream = 30000 + Math.floor(Math.random() * 5000);
	const incoming = upstream + 10000;
	const sockets = [];
	let nginx;
	try {
		for (let offset = 0; offset < 2; offset++) {
			const tcp = net.createServer((socket) => socket.on("data", (data) => socket.write(`${offset}:${data}`)));
			sockets.push(tcp);
			tcp.listen(upstream + offset, "127.0.0.1");
			await once(tcp, "listening");
			const udp = dgram.createSocket("udp4");
			sockets.push(udp);
			udp.on("message", (data, remote) => udp.send(`${offset}:${data}`, remote.port, remote.address));
			udp.bind(upstream + offset, "127.0.0.1");
			await once(udp, "listening");
		}
		await mkdir(path.join(dir, "logs"));
		await mkdir(path.join(dir, "nginx", "custom"), { recursive: true });
		const root = fileURLToPath(new URL("../templates/", import.meta.url));
		const engine = new Liquid({ root });
		const template = await readFile(path.join(root, "stream.conf"), "utf8");
		let servers = "";
		for (const fixed of [false, true]) {
			const start = incoming + (fixed ? 2 : 0);
			const host = {
				id: fixed ? 2 : 1,
				enabled: true,
				ipv6: false,
				tcp_forwarding: true,
				udp_forwarding: true,
				incoming_port: `${start}-${start + 1}`,
				forwarding_host: "127.0.0.1",
				forwarding_port: fixed ? upstream : `${upstream}-${upstream + 1}`,
			};
			servers += await engine.parseAndRender(template, { ...host, port_bindings: streamPortBindings(host) });
		}
		servers = servers.replaceAll("/data/", `${dir}/`);
		const config = path.join(dir, "nginx.conf");
		await writeFile(
			config,
			`load_module ${modulePath};
pid ${dir}/nginx.pid;
error_log ${dir}/error.log;
events { worker_connections 256; }
stream { log_format stream '$remote_addr $server_port'; ${servers} }
`,
		);
		const check = spawnSync("nginx", ["-t", "-p", `${dir}/`, "-c", config], { encoding: "utf8" });
		assert.equal(check.status, 0, check.stderr);
		nginx = spawn("nginx", ["-p", `${dir}/`, "-c", config, "-g", "daemon off;"], { stdio: "ignore" });
		for (let retry = 0; retry < 100 && !existsSync(path.join(dir, "nginx.pid")); retry++) await delay(25);
		assert.ok(existsSync(path.join(dir, "nginx.pid")), "Nginx started");
		for (let offset = 0; offset < 4; offset++) {
			const expected = `${offset < 2 ? offset : 0}:hello`;
			const tcp = net.connect(incoming + offset, "127.0.0.1");
			try {
				tcp.setTimeout(2000, () => tcp.destroy(new Error("TCP timeout")));
				await once(tcp, "connect");
				tcp.write("hello");
				assert.equal(String((await once(tcp, "data"))[0]), expected);
			} finally {
				tcp.destroy();
			}
			const udp = dgram.createSocket("udp4");
			let timeout;
			try {
				const response = once(udp, "message");
				udp.send("hello", incoming + offset, "127.0.0.1");
				const expired = new Promise((_, reject) => {
					timeout = setTimeout(() => reject(new Error("UDP timeout")), 2000);
				});
				assert.equal(String((await Promise.race([response, expired]))[0]), expected);
			} finally {
				clearTimeout(timeout);
				udp.close();
			}
		}
	} finally {
		if (nginx && nginx.exitCode === null) {
			const stopped = once(nginx, "exit");
			nginx.kill("SIGTERM");
			await stopped;
		}
		for (const socket of sockets) socket.close();
		await rm(dir, { recursive: true, force: true });
	}
});

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { Liquid } from "liquidjs";
import { parseStreamPort, streamPortBindings, validateStreamPorts } from "../lib/stream-ports.js";
import apiValidator from "../lib/validator/api.js";
import { getCompiledSchema, getValidationSchema } from "../schema/index.js";

test("single ports stay numeric and degenerate ranges are normalized", () => {
	for (const value of [1, "80", "65535", "8080-8080"]) {
		assert.equal(typeof parseStreamPort(value).value, "number");
	}
});

test("rejects malformed, descending, out-of-bounds and injected ports", () => {
	for (const value of [
		0,
		65536,
		-1,
		1.5,
		"1e3",
		"01",
		"1-0",
		"20-10",
		"1-65536",
		"80;",
		"80\n",
		" 80",
		"",
		null,
		undefined,
	]) {
		assert.throws(() => parseStreamPort(value));
	}
});

test("maps equal-size ranges in order, including translated ranges", () => {
	assert.deepEqual(streamPortBindings({ incoming_port: "2000-2002", forwarding_port: "3000-3002" }), [
		{ incoming_port: 2000, forwarding_port: 3000 },
		{ incoming_port: 2001, forwarding_port: 3001 },
		{ incoming_port: 2002, forwarding_port: 3002 },
	]);
	assert.deepEqual(streamPortBindings({ incoming_port: "2000-2002", forwarding_port: 80 }), [
		{ incoming_port: "2000-2002", forwarding_port: 80 },
	]);
	assert.throws(() => validateStreamPorts({ incoming_port: 2000, forwarding_port: "3000-3002" }));
	assert.throws(() => validateStreamPorts({ incoming_port: "2000-2002", forwarding_port: "3000-3001" }));
});

test("create and partial-update API schemas accept range syntax", async () => {
	await getCompiledSchema();
	const payload = {
		incoming_port: "27015-27030",
		forwarding_host: "127.0.0.1",
		forwarding_port: "27015-27030",
		tcp_forwarding: true,
		udp_forwarding: true,
	};
	await apiValidator(getValidationSchema("/nginx/streams", "post"), payload);
	await apiValidator(getValidationSchema("/nginx/streams/{streamID}", "put"), { incoming_port: "27015-27030" });
	await assert.rejects(() =>
		apiValidator(getValidationSchema("/nginx/streams", "post"), { ...payload, incoming_port: "80;evil" }),
	);
	assert.throws(() => validateStreamPorts({ ...payload, forwarding_port: "65536" }));
});

const engine = new Liquid({ root: new URL("../templates/", import.meta.url).pathname.replace(/^\/(\w:)/, "$1") });
const template = await readFile(new URL("../templates/stream.conf", import.meta.url), "utf8");
const render = (overrides = {}) => {
	const host = {
		id: 1,
		enabled: true,
		tcp_forwarding: true,
		udp_forwarding: true,
		ipv6: true,
		incoming_port: "27015-27016",
		forwarding_port: "28015-28016",
		forwarding_host: "127.0.0.1",
		...overrides,
	};
	return engine.parseAndRender(template, { ...host, port_bindings: streamPortBindings(host) });
};

test("renders TCP/UDP and IPv6 listeners with each matching static upstream", async () => {
	const config = await render();
	for (const port of [27015, 27016]) {
		assert.ok(config.includes(`listen ${port} reuseport;`));
		assert.ok(config.includes(`listen [::]:${port} udp reuseport;`));
		assert.ok(config.includes(`proxy_pass 127.0.0.1:${port + 1000};`));
	}
	assert.equal((config.match(/server \{/g) || []).length, 4);
});

test("renders a native range to a fixed port and keeps hostname upstreams static", async () => {
	const config = await render({ forwarding_port: 80, forwarding_host: "example.com", udp_forwarding: false });
	assert.ok(config.includes("listen 27015-27016 reuseport;"));
	assert.ok(config.includes("proxy_pass example.com:80;"));
	assert.equal((config.match(/server \{/g) || []).length, 1);
});

test("retains SSL certificate configuration on every TCP port and disables cleanly", async () => {
	const config = await render({ certificate_id: 7, certificate: { provider: "other" }, udp_forwarding: false });
	assert.equal((config.match(/ssl_certificate_key \/data\/custom_ssl\/npm-7\/privkey.pem;/g) || []).length, 2);
	assert.ok(config.includes("listen 27016 reuseport ssl;"));
	assert.ok(!(await render({ enabled: false })).includes("server {"));
});

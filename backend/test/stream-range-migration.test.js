import assert from "node:assert/strict";
import test from "node:test";
import knex from "knex";
import { down, up } from "../migrations/20261026000000_stream_port_ranges.js";

test("SQLite migration preserves ports, stores ranges and prevents lossy rollback", async () => {
	const db = knex({ client: "sqlite3", connection: { filename: ":memory:" }, useNullAsDefault: true });
	try {
		await db.schema.createTable("stream", (table) => {
			table.increments("id");
			table.integer("incoming_port").notNullable().unsigned();
			table.integer("forwarding_port").notNullable().unsigned();
		});
		await db("stream").insert({ incoming_port: 2222, forwarding_port: 22 });
		await up(db);
		const saved = await db("stream").first();
		assert.equal(Number(saved.incoming_port), 2222);
		assert.equal(Number(saved.forwarding_port), 22);
		await db("stream").insert({ incoming_port: "27015-27030", forwarding_port: "28015-28030" });
		assert.equal((await db("stream").where("id", 2).first()).forwarding_port, "28015-28030");
		await assert.rejects(() => down(db), /Remove stream port ranges/);
		await db("stream").where("id", 2).delete();
		await down(db);
		assert.equal((await db("stream").first()).incoming_port, 2222);
	} finally {
		await db.destroy();
	}
});

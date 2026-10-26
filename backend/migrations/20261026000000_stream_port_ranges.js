// Strings accommodate "start-end" while retaining all existing port values.
export async function up(knex) {
	await knex.schema.alterTable("stream", (table) => {
		table.string("incoming_port", 11).notNullable().alter();
		table.string("forwarding_port", 11).notNullable().alter();
	});
}

export async function down(knex) {
	const range = await knex("stream")
		.where("incoming_port", "like", "%-%")
		.orWhere("forwarding_port", "like", "%-%")
		.first();
	if (range) {
		throw new Error("Remove stream port ranges (including deleted streams) before rolling back this migration");
	}
	await knex.schema.alterTable("stream", (table) => {
		table.integer("incoming_port").unsigned().notNullable().alter();
		table.integer("forwarding_port").unsigned().notNullable().alter();
	});
}

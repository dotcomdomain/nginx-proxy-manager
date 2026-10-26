import errs from "./error.js";

// Keep ordinary ports numeric for compatibility with existing API clients.
export function parseStreamPort(value) {
	if (
		!["string", "number"].includes(typeof value) ||
		String(value).trim() !== String(value) ||
		!/^[1-9]\d{0,4}(?:-[1-9]\d{0,4})?$/.test(String(value))
	) {
		throw new errs.ValidationError("Enter a port or port range, for example 8080 or 27015-27030");
	}
	const [start, last] = String(value).split("-").map(Number);
	const end = last ?? start;
	if (start > 65535 || end > 65535 || end < start) {
		throw new errs.ValidationError("Ports must be between 1 and 65535 and ranges must be ascending");
	}
	return { start, end, value: start === end ? start : `${start}-${end}` };
}

export function validateStreamPorts(data) {
	const incoming = parseStreamPort(data.incoming_port);
	const forwarding = parseStreamPort(data.forwarding_port);
	if (forwarding.end !== forwarding.start && forwarding.end - forwarding.start !== incoming.end - incoming.start) {
		throw new errs.ValidationError("Incoming and forwarding port ranges must contain the same number of ports");
	}
	return { incoming_port: incoming.value, forwarding_port: forwarding.value };
}

export function streamPortBindings(data) {
	const ports = validateStreamPorts(data);
	const incoming = parseStreamPort(ports.incoming_port);
	const forwarding = parseStreamPort(ports.forwarding_port);
	if (forwarding.start === forwarding.end) {
		// Nginx accepts a native listen range when every port has the same upstream.
		return [ports];
	}
	// Static upstreams also work with hostnames without requiring a runtime resolver.
	return Array.from({ length: incoming.end - incoming.start + 1 }, (_, offset) => ({
		incoming_port: incoming.start + offset,
		forwarding_port: forwarding.start + offset,
	}));
}

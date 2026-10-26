export function validateStreamPort(value: string | number): string | undefined {
	if (String(value).trim() !== String(value) || !/^[1-9]\d{0,4}(?:-[1-9]\d{0,4})?$/.test(String(value))) {
		return "Enter a port or range, for example 8080 or 27015-27030";
	}
	const [start, last] = String(value).split("-").map(Number);
	if (start > 65535 || (last ?? start) > 65535 || (last ?? start) < start) {
		return "Ports must be between 1 and 65535 and ranges must be ascending";
	}
}

export function validateStreamPortPair(values: { incomingPort: string | number; forwardingPort: string | number }) {
	const errors: { incomingPort?: string; forwardingPort?: string } = {};
	errors.incomingPort = validateStreamPort(values.incomingPort);
	errors.forwardingPort = validateStreamPort(values.forwardingPort);
	if (!errors.incomingPort && !errors.forwardingPort) {
		const size = (value: string | number) => {
			const [start, end] = String(value).split("-").map(Number);
			return (end ?? start) - start;
		};
		if (size(values.forwardingPort) > 0 && size(values.forwardingPort) !== size(values.incomingPort)) {
			errors.forwardingPort = "Incoming and forwarding ranges must contain the same number of ports";
		}
	}
	return Object.fromEntries(Object.entries(errors).filter(([, error]) => error));
}

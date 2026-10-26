import { describe, expect, it } from "vitest";
import { validateStreamPort, validateStreamPortPair } from "./StreamPorts";

describe("stream port form validation", () => {
	it("accepts ports, identical ranges, translated ranges and range-to-single", () => {
		for (const [incomingPort, forwardingPort] of [
			[80, 8080],
			["1-65535", "1-65535"],
			["2000-2002", "3000-3002"],
			["2000-2002", 80],
		]) {
			expect(validateStreamPortPair({ incomingPort, forwardingPort })).toEqual({});
		}
	});
	it("rejects malformed or mismatched ranges", () => {
		for (const value of ["0", "65536", "3-1", "80-65536", "1e3", "1.5", "", "80;", "80\n"]) {
			expect(validateStreamPort(value)).toBeTruthy();
		}
		expect(validateStreamPortPair({ incomingPort: "1-3", forwardingPort: "4-5" }).forwardingPort).toBeTruthy();
		expect(validateStreamPortPair({ incomingPort: 1, forwardingPort: "4-5" }).forwardingPort).toBeTruthy();
	});
});

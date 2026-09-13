import { describe, expect, it } from "vitest";

import { parseCanvasElementsJson } from "@/lib/parse-canvas-json";

const validBox = {
  id: "client",
  type: "box",
  matrix: [2, 1, 15, 3],
  label: "Client",
  colorTheme: "sky",
  time: { start: 0, end: 5, track: 0 },
};

describe("parseCanvasElementsJson", () => {
  it("parses a valid element array", () => {
    const result = parseCanvasElementsJson(JSON.stringify([validBox]));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.elements).toHaveLength(1);
      expect(result.elements[0].id).toBe("client");
    }
  });

  it("parses a number with a 2-cell or 4-cell matrix", () => {
    const two = parseCanvasElementsJson(
      JSON.stringify([
        {
          id: "n",
          type: "number",
          matrix: [0, 1],
          value: 1,
          colorTheme: "ink",
          time: { start: 0, end: 3, track: 1 },
        },
      ]),
    );
    expect(two.ok).toBe(true);

    const four = parseCanvasElementsJson(
      JSON.stringify([
        {
          id: "n",
          type: "number",
          matrix: [0, 1, 1, 2],
          value: 1,
          colorTheme: "ink",
          time: { start: 0, end: 3, track: 1 },
        },
      ]),
    );
    expect(four.ok).toBe(true);
  });

  it("rejects a non-integer or out-of-bounds matrix", () => {
    expect(
      parseCanvasElementsJson(
        JSON.stringify([{ ...validBox, matrix: [2.5, 1, 15, 3] }]),
      ),
    ).toEqual({ ok: false, error: "Element 0 is not a valid box." });

    expect(
      parseCanvasElementsJson(
        JSON.stringify([{ ...validBox, matrix: [2, 1, 18, 3] }]),
      ),
    ).toEqual({ ok: false, error: "Element 0 is not a valid box." });

    expect(
      parseCanvasElementsJson(
        JSON.stringify([{ ...validBox, matrix: [15, 1, 2, 3] }]),
      ),
    ).toEqual({ ok: false, error: "Element 0 is not a valid box." });

    expect(
      parseCanvasElementsJson(
        JSON.stringify([
          {
            id: "n",
            type: "number",
            matrix: [0],
            value: 1,
            colorTheme: "ink",
            time: { start: 0, end: 3, track: 1 },
          },
        ]),
      ),
    ).toEqual({ ok: false, error: "Element 0 is not a valid number." });
  });

  it("rejects invalid JSON", () => {
    expect(parseCanvasElementsJson("{")).toEqual({
      ok: false,
      error: "JSON is not valid.",
    });
  });

  it("rejects a non-array root", () => {
    expect(parseCanvasElementsJson("{}")).toEqual({
      ok: false,
      error: "JSON must be an array of elements.",
    });
  });
});

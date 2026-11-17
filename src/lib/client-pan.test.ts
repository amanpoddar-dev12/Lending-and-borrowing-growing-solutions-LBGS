import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { optionalPanSchema } from "./client-pan";

describe("optional client PAN", () => {
  test("accepts blank, omitted and null PAN", () => {
    assert.equal(optionalPanSchema.parse(""), null);
    assert.equal(optionalPanSchema.parse("   "), null);
    assert.equal(optionalPanSchema.parse(undefined), undefined);
    assert.equal(optionalPanSchema.parse(null), null);
  });

  test("still validates and normalizes a supplied PAN", () => {
    assert.equal(optionalPanSchema.parse(" abcde1234f "), "ABCDE1234F");
    assert.equal(optionalPanSchema.safeParse("invalid").success, false);
  });
});
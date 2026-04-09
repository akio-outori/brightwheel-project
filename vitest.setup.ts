// Test environment defaults. Storage tests target separate buckets so they
// never pollute the seeded handbook. Setting these here means individual test
// files don't need to remember.
process.env.STORAGE_HANDBOOK_BUCKET ??= "handbook-test";
process.env.STORAGE_EVENTS_BUCKET ??= "events-test";

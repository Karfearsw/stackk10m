function baseUrl() {
  return process.env.TEST_BASE_URL || "http://localhost:3000";
}

(process.env.TEST_BASE_URL ? describe : describe.skip)("/api/opportunities/:id", () => {
  it("returns detail payload when opportunities exist", async () => {
    const listRes = await fetch(`${baseUrl()}/api/opportunities`);
    expect(listRes.status).toBe(200);
    const items = (await listRes.json()) as any[];
    if (!items.length) return;

    const id = items[0].id;
    const detailRes = await fetch(`${baseUrl()}/api/opportunities/${id}`);
    expect(detailRes.status).toBe(200);
    const json = await detailRes.json();
    expect(typeof json?.property?.id).toBe("number");
  });
});


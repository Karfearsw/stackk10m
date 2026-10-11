/**
 * SSRF guard unit tests — server/lib/ssrf-guard.ts
 *
 * The in-app browser proxy fetches arbitrary user-supplied URLs server-side.
 * These tests lock the private-IP classification that underpins both the
 * hostname blocklist and the DNS-resolution guard (DNS rebinding defense).
 */
import { describe, it, expect } from "vitest";
import { isPrivateIpAddress, isBlockedHostname } from "../lib/ssrf-guard.js";

describe("isPrivateIpAddress", () => {
  it("flags IPv4 private ranges", () => {
    expect(isPrivateIpAddress("10.0.0.1")).toBe(true);
    expect(isPrivateIpAddress("10.255.255.255")).toBe(true);
    expect(isPrivateIpAddress("172.16.0.1")).toBe(true);
    expect(isPrivateIpAddress("172.31.255.255")).toBe(true);
    expect(isPrivateIpAddress("192.168.1.1")).toBe(true);
  });

  it("flags loopback, link-local, metadata, and reserved ranges", () => {
    expect(isPrivateIpAddress("127.0.0.1")).toBe(true);
    expect(isPrivateIpAddress("127.53.0.1")).toBe(true);
    expect(isPrivateIpAddress("169.254.169.254")).toBe(true); // cloud metadata
    expect(isPrivateIpAddress("0.0.0.0")).toBe(true);
    expect(isPrivateIpAddress("224.0.0.1")).toBe(true); // multicast
    expect(isPrivateIpAddress("240.0.0.1")).toBe(true); // reserved
  });

  it("flags IPv6 private ranges", () => {
    expect(isPrivateIpAddress("::1")).toBe(true);
    expect(isPrivateIpAddress("::")).toBe(true);
    expect(isPrivateIpAddress("fe80::1")).toBe(true);
    expect(isPrivateIpAddress("fc00::1")).toBe(true);
    expect(isPrivateIpAddress("fd00::1")).toBe(true);
    expect(isPrivateIpAddress("ff02::1")).toBe(true);
  });

  it("allows public IPs", () => {
    expect(isPrivateIpAddress("8.8.8.8")).toBe(false);
    expect(isPrivateIpAddress("1.1.1.1")).toBe(false);
    expect(isPrivateIpAddress("93.184.216.34")).toBe(false);
    expect(isPrivateIpAddress("172.15.255.255")).toBe(false); // just outside 172.16/12
    expect(isPrivateIpAddress("172.32.0.1")).toBe(false); // just outside 172.16/12
    expect(isPrivateIpAddress("2606:4700:4700::1111")).toBe(false);
  });
});

describe("isBlockedHostname", () => {
  it("blocks localhost and literal private IPs", () => {
    expect(isBlockedHostname("localhost")).toBe(true);
    expect(isBlockedHostname("127.0.0.1")).toBe(true);
    expect(isBlockedHostname("::1")).toBe(true);
    expect(isBlockedHostname("192.168.0.5")).toBe(true);
    expect(isBlockedHostname("10.1.2.3")).toBe(true);
  });

  it("blocks internal suffixes", () => {
    expect(isBlockedHostname("db.local")).toBe(true);
    expect(isBlockedHostname("svc.internal")).toBe(true);
  });

  it("is case-insensitive", () => {
    expect(isBlockedHostname("LOCALHOST")).toBe(true);
  });

  it("allows public hostnames", () => {
    expect(isBlockedHostname("www.zillow.com")).toBe(false);
    expect(isBlockedHostname("html.duckduckgo.com")).toBe(false);
    expect(isBlockedHostname("r.jina.ai")).toBe(false);
  });
});

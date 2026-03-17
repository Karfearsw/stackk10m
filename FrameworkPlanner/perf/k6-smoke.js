import http from "k6/http";
import { check, sleep } from "k6";

export const options = {
  vus: Number(__ENV.K6_VUS || 10),
  duration: __ENV.K6_DURATION || "2m",
  thresholds: {
    http_req_failed: ["rate<0.01"],
    http_req_duration: ["p(95)<1200"],
  },
};

const baseUrl = (__ENV.BASE_URL || "http://localhost:3000").replace(/\/+$/, "");

export default function () {
  const health = http.get(`${baseUrl}/api/health`);
  check(health, { "health 200": (r) => r.status === 200 });

  const leads = http.get(`${baseUrl}/api/leads?limit=10&offset=0`);
  check(leads, { "leads 200": (r) => r.status === 200 });

  const props = http.get(`${baseUrl}/api/properties?limit=10&offset=0`);
  check(props, { "properties 200": (r) => r.status === 200 });

  const search = http.get(`${baseUrl}/api/search?q=st&limit=10&offset=0`);
  check(search, { "search 200": (r) => r.status === 200 });

  sleep(1);
}


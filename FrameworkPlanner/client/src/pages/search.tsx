import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Layout } from "@/components/layout/Layout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useLocation } from "wouter";

function useQueryParam(name: string) {
  const [value, setValue] = useState<string>("");
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setValue(params.get(name) || "");
  }, [name]);
  return value;
}

export default function SearchPage() {
  const q = useQueryParam("q");
  const [location, setLocation] = useLocation();
  const [page, setPage] = useState(0);
  const limit = 50;
  const offset = page * limit;
  const { data, isFetching } = useQuery<any>({
    queryKey: ["/api/search", q, limit, offset],
    queryFn: async () => {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}&limit=${limit}&offset=${offset}`);
      return res.json();
    },
    enabled: q.trim().length >= 2,
  });

  const total = data?.counts?.total || 0;
  const totalPages = Math.max(1, Math.ceil(total / limit));

  const onSelect = (item: any) => {
    if (item.path) setLocation(item.path);
  };

  return (
    <Layout>
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Search results</h1>
        {isFetching && <span className="text-sm text-muted-foreground">Loading…</span>}
      </div>
      {q ? (
        <p className="text-sm text-muted-foreground">Query: <span className="font-medium">{q}</span></p>
      ) : (
        <p className="text-sm text-muted-foreground">Type at least 2 characters to search.</p>
      )}
      <div className="grid gap-2">
        {(data?.results || []).map((item: any) => (
          <button
            key={`${item.type}-${item.id}`}
            className="flex items-center justify-between px-3 py-2 bg-background border rounded hover:bg-muted/50 text-left"
            onClick={() => onSelect(item)}
          >
            <div>
              <div className="font-medium">{item.title}</div>
              {item.subtitle && <div className="text-xs text-muted-foreground">{item.subtitle}</div>}
            </div>
            <Badge variant="secondary">{item.type}</Badge>
          </button>
        ))}
      </div>
      {total > limit && (
        <div className="flex items-center gap-2">
          <Button variant="outline" disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>Prev</Button>
          <span className="text-sm text-muted-foreground">Page {page + 1} / {totalPages}</span>
          <Button variant="outline" disabled={page + 1 >= totalPages} onClick={() => setPage((p) => p + 1)}>Next</Button>
        </div>
      )}
    </Layout>
  );
}


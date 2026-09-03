"use client";

import { useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";

export function ReactQueryProvider({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 1000 * 60 * 5,
            refetchOnWindowFocus: false,
          },
        },
      })
  );

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

export function SafeQueryClientProvider({ children }: { children: ReactNode }) {
  let hasProvider = true;
  try {
    useQueryClient();
  } catch {
    hasProvider = false;
  }

  const [testClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            retry: false,
            staleTime: 0,
            gcTime: 0,
            refetchOnWindowFocus: false,
          },
        },
      })
  );

  if (hasProvider) {
    return <>{children}</>;
  }

  return <QueryClientProvider client={testClient}>{children}</QueryClientProvider>;
}

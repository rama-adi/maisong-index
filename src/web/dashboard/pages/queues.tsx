import { trpc } from "@/web/trpc/client";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableCaption,
} from "@/web/components/ui/table";
import { Button } from "@/web/components/ui/button";
import { useMemo, useState } from "react";
import { Badge } from "@/web/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/web/components/ui/card";
import dayjs from "dayjs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/web/components/ui/dialog";

export function DashboardQueues() {
  const [message, setMessage] = useState<string | null>(null);
  const [messageType, setMessageType] = useState<"success" | "error">("success");
  const [stateFilter, setStateFilter] = useState<string | "all">("all");
  const [nameFilter, setNameFilter] = useState<string>("");
  const [isLogOpen, setIsLogOpen] = useState(false);
  const [logJob, setLogJob] = useState<any | null>(null);
  const [isDataOpen, setIsDataOpen] = useState(false);
  const [dataJob, setDataJob] = useState<any | null>(null);

  const { data: jobs, isLoading, error, refetch } = useQuery({
    ...trpc.queues.list.queryOptions({}),
    refetchInterval: 5000,
    refetchIntervalInBackground: true,
  });

  const testMutation = useMutation({
    ...trpc.queues.test.mutationOptions({}),
    onSuccess: () => {
      setMessage("Test jobs created successfully!");
      setMessageType("success");
      refetch();
      setTimeout(() => setMessage(null), 3000);
    },
    onError: (error) => {
      setMessage(`Error creating test jobs: ${error.message}`);
      setMessageType("error");
      setTimeout(() => setMessage(null), 5000);
    },
  });

  const logsQuery = useQuery({
    ...trpc.queues.viewLog.queryOptions({ id: String(logJob?.id ?? "0") }),
    enabled: Boolean(isLogOpen && logJob?.id),
    refetchInterval: 2000,
    refetchIntervalInBackground: true,
  });

  const filteredJobs = useMemo(() => {
    const list = jobs ?? [];
    return list.filter((j: any) => {
      const stateOk = stateFilter === "all" || j.progress === stateFilter;
      const nameOk = !nameFilter || String(j.name ?? j.metadata?.name ?? "").toLowerCase().includes(nameFilter.toLowerCase());
      return stateOk && nameOk;
    });
  }, [jobs, stateFilter, nameFilter]);

  const stats = useMemo(() => {
    const list = jobs ?? [];
    const byState = list.reduce<Record<string, number>>((acc: any, j: any) => {
      const s = String(j.progress ?? "unknown");
      acc[s] = (acc[s] ?? 0) + 1;
      return acc;
    }, {});
    return { total: list.length, byState };
  }, [jobs]);

  const stateVariant = (s: string) => {
    switch (s) {
      case "finished":
        return "secondary" as const;
      case "failed":
        return "destructive" as const;
      case "working":
        return "default" as const;
      case "skipped":
        return "outline" as const;
      default:
        return "outline" as const;
    }
  };

  if (isLoading) {
    return <div className="flex items-center justify-center p-8">Loading queues...</div>;
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Queue Jobs</h1>
        <Button onClick={() => testMutation.mutate({})} disabled={testMutation.isPending}>
          {testMutation.isPending ? "Creating Jobs..." : "Create Test Jobs"}
        </Button>
      </div>

      {message && (
        <div
          className={`mb-2 p-3 rounded-md ${
            messageType === "success"
              ? "bg-green-100 text-green-800 border border-green-200"
              : "bg-red-100 text-red-800 border border-red-200"
          }`}
        >
          {message}
        </div>
      )}

      {error && (
        <div className="flex items-center justify-center p-8 text-red-500">
          Error loading queues: {error.message}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Total</CardTitle>
            <CardDescription>All tracked jobs</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-semibold">{stats.total}</div>
          </CardContent>
        </Card>
        {Object.entries(stats.byState).map(([state, count]) => (
          <Card key={state}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Badge variant={stateVariant(state)}>{state}</Badge>
              </CardTitle>
              <CardDescription>Jobs in this state</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-semibold">{count as number}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex gap-3 items-center">
        <select
          className="border rounded-md px-2 py-1 h-9 bg-background"
          value={stateFilter}
          onChange={(e) => setStateFilter(e.target.value)}
        >
          {["all", "working", "finished", "failed", "skipped"].map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <input
          className="border rounded-md px-2 py-1 h-9 w-64 bg-background"
          placeholder="Filter by name"
          value={nameFilter}
          onChange={(e) => setNameFilter(e.target.value)}
        />
        <div className="text-sm text-muted-foreground">
          Showing {filteredJobs.length} of {jobs?.length ?? 0}
        </div>
      </div>

      {!filteredJobs || filteredJobs.length === 0 ? (
        <div className="flex items-center justify-center p-8 text-gray-500">No queue jobs found</div>
      ) : (
        <Table>
          <TableCaption>A list of all queue jobs ({filteredJobs.length} shown)</TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead>Job</TableHead>
              <TableHead>Progress</TableHead>
              <TableHead>Queue</TableHead>
              <TableHead>Label/Tags</TableHead>
              <TableHead>Data</TableHead>
              <TableHead className="w-[100px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredJobs.map((job: any) => (
              <TableRow key={job.id}>
                <TableCell className="max-w-[220px]">
                  <div className="font-medium flex items-center gap-2">
                    <span className="font-mono text-xs text-muted-foreground">#{job.id}</span>
                    <span>{job.name ?? job.metadata?.name ?? "Unknown"}</span>
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant={stateVariant(job.progress)}>{job.progress}</Badge>
                </TableCell>
                <TableCell className="text-xs">{job.queue}</TableCell>
                <TableCell className="text-xs max-w-[260px]">
                  <div className="truncate">
                    {job.label ? <span className="mr-2">Label: {job.label}</span> : null}
                    {Array.isArray(job.tags) && job.tags.length > 0 ? (
                      <span>Tags: {job.tags.join(", ")}</span>
                    ) : null}
                  </div>
                </TableCell>
                <TableCell className="max-w-md">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setDataJob(job);
                      setIsDataOpen(true);
                    }}
                  >
                    View Data
                  </Button>
                </TableCell>
                <TableCell>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setLogJob(job);
                      setIsLogOpen(true);
                    }}
                  >
                    View Logs
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <Dialog open={isLogOpen} onOpenChange={(open) => {
        setIsLogOpen(open);
        if (!open) setLogJob(null);
      }}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {logJob ? `Logs for ${logJob.name ?? logJob.metadata?.name ?? 'Job'} #${logJob.id}` : 'Logs'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {logsQuery.isLoading ? (
              <div className="text-sm text-muted-foreground">Loading logs…</div>
            ) : logsQuery.error ? (
              <div className="text-sm text-red-600">{(logsQuery.error as any).message}</div>
            ) : (
              <pre className="text-xs bg-muted/50 p-3 rounded-md max-h-[360px] overflow-auto whitespace-pre-wrap break-words">
                {(logsQuery.data ?? []).length === 0 ? 'No logs yet.' : (logsQuery.data ?? []).join('\n\n')}
              </pre>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={isDataOpen} onOpenChange={(open) => {
        setIsDataOpen(open);
        if (!open) setDataJob(null);
      }}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {dataJob ? `Data for ${dataJob.name ?? dataJob.metadata?.name ?? 'Job'} #${dataJob.id}` : 'Data'}
            </DialogTitle>
          </DialogHeader>
          <pre className="text-xs bg-muted/50 p-3 rounded-md max-h-[360px] overflow-auto whitespace-pre-wrap break-words">
            {(() => {
              try {
                return JSON.stringify(dataJob?.data ?? {}, null, 2);
              } catch {
                return String(dataJob?.data ?? '');
              }
            })()}
          </pre>
        </DialogContent>
      </Dialog>
    </div>
  );
}
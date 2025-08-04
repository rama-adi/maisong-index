import { trpc } from "@/web/trpc/client";
import { useQuery, useMutation } from "@tanstack/react-query";
import { 
    Table, 
    TableBody, 
    TableCell, 
    TableHead, 
    TableHeader, 
    TableRow,
    TableCaption 
} from "@/web/components/ui/table";
import { Button } from "@/web/components/ui/button";
import { useState } from "react";

export function DashboardQueues() {
    const [message, setMessage] = useState<string | null>(null);
    const [messageType, setMessageType] = useState<'success' | 'error'>('success');

    const { data: jobs, isLoading, error, refetch } = useQuery({
        ...trpc.queues.list.queryOptions({}),
        refetchInterval: 5000, // Poll every 5 seconds
        refetchIntervalInBackground: true, // Continue polling when tab is not active
    });

    const testMutation = useMutation({
        ...trpc.queues.test.mutationOptions(),
        onSuccess: () => {
            setMessage('Test jobs created successfully!');
            setMessageType('success');
            // Refetch the jobs list to show the new jobs
            refetch();
            // Clear message after 3 seconds
            setTimeout(() => setMessage(null), 3000);
        },
        onError: (error) => {
            setMessage(`Error creating test jobs: ${error.message}`);
            setMessageType('error');
            // Clear message after 5 seconds
            setTimeout(() => setMessage(null), 5000);
        }
    });

    if (isLoading) {
        return <div className="flex items-center justify-center p-8">Loading queues...</div>;
    }

    return (
        <div className="p-6">
            <div className="flex items-center justify-between mb-6">
                <h1 className="text-2xl font-bold">Queue Jobs</h1>
                <Button 
                    onClick={() => testMutation.mutate({})}
                    disabled={testMutation.isPending}
                    className="bg-blue-600 hover:bg-blue-700"
                >
                    {testMutation.isPending ? 'Creating Jobs...' : 'Create Test Jobs'}
                </Button>
            </div>
            
            {message && (
                <div className={`mb-4 p-3 rounded-md ${
                    messageType === 'success' 
                        ? 'bg-green-100 text-green-800 border border-green-200' 
                        : 'bg-red-100 text-red-800 border border-red-200'
                }`}>
                    {message}
                </div>
            )}

            {error && (
                <div className="flex items-center justify-center p-8 text-red-500">
                    Error loading queues: {error.message}
                </div>
            )}

            {!jobs || jobs.length === 0 ? (
                <div className="flex items-center justify-center p-8 text-gray-500">
                    No queue jobs found
                </div>
            ) : (
            <Table>
                <TableCaption>
                    A list of all queue jobs ({jobs.length} total)
                </TableCaption>
                <TableHeader>
                    <TableRow>
                        <TableHead>Job ID</TableHead>
                        <TableHead>Queue Name</TableHead>
                        <TableHead>Data</TableHead>
                        <TableHead>Metadata</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {jobs.map((job) => (
                        <TableRow key={job.id}>
                            <TableCell className="font-mono text-sm">
                                {job.id}
                            </TableCell>
                            <TableCell>
                                {job.metadata.name?.[0] || 'Unknown'}
                            </TableCell>
                            <TableCell className="max-w-md">
                                <div className="truncate">
                                    {typeof job.data === 'object' ? 
                                        JSON.stringify(job.data) : 
                                        String(job.data)
                                    }
                                </div>
                            </TableCell>
                            <TableCell>
                                <div className="space-y-1">
                                    {Object.entries(job.metadata).map(([key, values]) => (
                                        <div key={key} className="text-sm">
                                            <span className="font-medium">{key}:</span>{' '}
                                            {Array.isArray(values) ? values.join(', ') : String(values)}
                                        </div>
                                    ))}
                                </div>
                            </TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
            )}
        </div>
    );
}
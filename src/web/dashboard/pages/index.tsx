import { Fragment } from "react"
import { Button } from "@/web/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/web/components/ui/card"
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/web/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/web/components/ui/tabs"
import { Badge } from "@/web/components/ui/badge"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/web/components/ui/tooltip"
import { Checkbox } from "@/web/components/ui/checkbox"
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/web/components/ui/sidebar"
import { Separator } from "@/web/components/ui/separator"


export default function DashboardIndex() {
    return (
        <main className="container mx-auto max-w-6xl p-8 space-y-8">
            {/* Hero Section */}
            <header className="space-y-4">
                <div className="flex items-center gap-3">
                    <h1 className="text-4xl font-bold tracking-tight">Welcome to Constantan</h1>
                    <Badge variant="secondary" className="text-xs">Experimental</Badge>
                </div>
                <p className="text-lg text-muted-foreground max-w-3xl">
                    An experimental fullstack framework built on Bun runtime, focusing on job processing with a clean web dashboard for inspection. 
                    Constantan is perfect for internal tools and MVPs, or for building consumer-facing apps that need a backoffice.
                </p>
            </header>

            {/* Feature Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <Card>
                    <CardHeader className="pb-3">
                        <CardTitle className="text-sm font-medium">Bun-Native</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-sm text-muted-foreground">Built for speed with TypeScript and runs directly with <code className="bg-muted px-1 py-0.5 rounded text-xs">bun</code></p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="pb-3">
                        <CardTitle className="text-sm font-medium">BullMQ Queues</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-sm text-muted-foreground">Define jobs using <code className="bg-muted px-1 py-0.5 rounded text-xs">BaseQueue</code> and process them with dedicated workers</p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="pb-3">
                        <CardTitle className="text-sm font-medium">Effect Runtime</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-sm text-muted-foreground">Typed, composable effects with dependency injection via layers</p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="pb-3">
                        <CardTitle className="text-sm font-medium">Type-Safe APIs</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-sm text-muted-foreground">tRPC endpoints expose queue data with full type safety</p>
                    </CardContent>
                </Card>
            </div>

            {/* Quick Start Section */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        Quick Start
                        <Badge variant="outline">Getting Started</Badge>
                    </CardTitle>
                    <CardDescription>
                        Get Constantan running in minutes with these essential commands
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <Tabs defaultValue="server" className="w-full">
                        <TabsList className="grid w-full grid-cols-3">
                            <TabsTrigger value="server">Development Server</TabsTrigger>
                            <TabsTrigger value="worker">Worker Process</TabsTrigger>
                            <TabsTrigger value="example">Example Queue</TabsTrigger>
                        </TabsList>
                        
                        <TabsContent value="server" className="space-y-4">
                            <div className="rounded-lg bg-muted p-4">
                                <code className="text-sm">bun run index.tsx</code>
                            </div>
                            <p className="text-sm text-muted-foreground">
                                Starts the HTTP server, exposes <code className="bg-muted px-1 py-0.5 rounded text-xs">/trpc</code> endpoints and serves this dashboard at <code className="bg-muted px-1 py-0.5 rounded text-xs">/dashboard</code>
                            </p>
                        </TabsContent>
                        
                        <TabsContent value="worker" className="space-y-4">
                            <div className="rounded-lg bg-muted p-4">
                                <code className="text-sm">bun run worker.ts</code>
                            </div>
                            <p className="text-sm text-muted-foreground">
                                The worker pulls jobs from the <code className="bg-muted px-1 py-0.5 rounded text-xs">app</code> queue and executes them using Effect-based processors
                            </p>
                        </TabsContent>
                        
                        <TabsContent value="example" className="space-y-4">
                            <div className="rounded-lg bg-muted p-4 text-sm font-mono">
                                <div className="space-y-1">
                                    <div><span className="text-blue-600">export class</span> <span className="text-orange-600">LogQueue</span> <span className="text-blue-600">extends</span> <span className="text-orange-600">QueueTag</span>(<span className="text-green-600">"sendLog"</span>) {'{'}</div>
                                    <div className="ml-2"><span className="text-blue-600">static override readonly</span> schema = LogSchema;</div>
                                    <div className="ml-2"><span className="text-blue-600">static override</span> <span className="text-orange-600">handle</span>(data) {'{'}</div>
                                    <div className="ml-4"><span className="text-blue-600">return</span> Effect.<span className="text-orange-600">logInfo</span>(`Message: ${'{'}data.message{'}'}`)</div>
                                    <div className="ml-2">{'}'}</div>
                                    <div>{'}'}</div>
                                </div>
                            </div>
                            <p className="text-sm text-muted-foreground">
                                Jobs can be enqueued via the <code className="bg-muted px-1 py-0.5 rounded text-xs">QueueService</code> from anywhere in your application
                            </p>
                        </TabsContent>
                    </Tabs>
                </CardContent>
            </Card>

            {/* Dashboard Ideas Section */}
            <Card>
                <CardHeader>
                    <CardTitle>Dashboard Inspiration</CardTitle>
                    <CardDescription>
                        Build focused, purposeful views that help your team stay productive
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-3">
                            <h4 className="font-medium text-foreground">Operations & Monitoring</h4>
                            <ul className="space-y-2 text-sm text-muted-foreground">
                                <li>• <span className="font-medium text-foreground">Operations Dashboard</span> - KPIs, error rates, job latency</li>
                                <li>• <span className="font-medium text-foreground">Queue Control Center</span> - Queue sizes, concurrency, rate limits</li>
                                <li>• <span className="font-medium text-foreground">Service Health</span> - Uptime, p95 latency, incident timeline</li>
                                <li>• <span className="font-medium text-foreground">Geo Insights</span> - Regional hotspots and events</li>
                            </ul>
                        </div>
                        
                        <div className="space-y-3">
                            <h4 className="font-medium text-foreground">Team & Business</h4>
                            <ul className="space-y-2 text-sm text-muted-foreground">
                                <li>• <span className="font-medium text-foreground">Developer Productivity</span> - PR status, CI runs, roadmap</li>
                                <li>• <span className="font-medium text-foreground">Customer Success</span> - Cohorts, session quality, playbooks</li>
                                <li>• <span className="font-medium text-foreground">Cost & Efficiency</span> - Spend by service, compute waste</li>
                                <li>• <span className="font-medium text-foreground">Feature Rollouts</span> - Flags, experiments, rollback controls</li>
                            </ul>
                        </div>
                    </div>
                    
                    <Separator />
                    
                    <div className="rounded-lg bg-muted/50 p-4">
                        <h4 className="font-medium text-foreground mb-2">Pro Tip</h4>
                        <p className="text-sm text-muted-foreground">
                            Start tiny. Pick one view, outline the headings, write one sentence per section, and drop in realistic seed numbers. 
                            Use consistent status language—<Badge variant="outline" className="mx-1">queued</Badge>
                            <Badge variant="outline" className="mx-1">processing</Badge>
                            <Badge variant="outline" className="mx-1">failed</Badge>
                            <Badge variant="outline" className="mx-1">completed</Badge>—and prefer drawers for details.
                        </p>
                    </div>
                </CardContent>
            </Card>

            {/* Status Notice */}
            <Card className="border-orange-200 bg-orange-50 dark:border-orange-800 dark:bg-orange-950/30">
                <CardContent className="pt-6">
                    <div className="flex items-start gap-3">
                        <div className="w-2 h-2 rounded-full bg-orange-500 mt-2 flex-shrink-0"></div>
                        <div>
                            <p className="text-sm font-medium text-orange-900 dark:text-orange-100">
                                Experimental Framework
                            </p>
                            <p className="text-sm text-orange-700 dark:text-orange-200 mt-1">
                                Constantan is a proof of concept and not ready for production use. Feel free to explore, modify and extend it for your own experiments.
                            </p>
                        </div>
                    </div>
                </CardContent>
            </Card>
        </main>
    )
}
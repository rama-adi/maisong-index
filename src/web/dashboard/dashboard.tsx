import { useQuery } from "@tanstack/react-query";
import { trpc } from "./trpc";

export function Dashboard() {
  const queueQuery = useQuery(trpc.queues.list.queryOptions({}));

  return (
    <div>
      <h1>Queues</h1>
      <div>
        
      </div>
    </div>
  );
}

export default Dashboard;

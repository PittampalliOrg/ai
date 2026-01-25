'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2 } from 'lucide-react';

interface WorkflowRun {
  id: number;
  name: string;
  status: string;
  conclusion: string | null;
  html_url: string;
  created_at: string;
  updated_at: string;
  head_branch: string;
  event: string;
}

interface GitHubActionsWidgetProps {
  owner: string;
  repo: string;
  token?: string;
}

export function GitHubActionsWidget({ owner, repo, token }: GitHubActionsWidgetProps) {
  const [workflows, setWorkflows] = useState<WorkflowRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchWorkflows() {
      try {
        const response = await fetch(`/api/github/actions?owner=${owner}&repo=${repo}`, {
          headers: token ? { 'Authorization': `Bearer ${token}` } : {},
        });

        if (!response.ok) {
          throw new Error('Failed to fetch workflows');
        }

        const data = await response.json();
        setWorkflows(data.workflow_runs || []);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An error occurred');
      } finally {
        setLoading(false);
      }
    }

    fetchWorkflows();
  }, [owner, repo, token]);

  const getStatusColor = (status: string, conclusion: string | null) => {
    if (status === 'completed') {
      switch (conclusion) {
        case 'success':
          return 'bg-green-500';
        case 'failure':
          return 'bg-red-500';
        case 'cancelled':
          return 'bg-gray-500';
        default:
          return 'bg-yellow-500';
      }
    }
    return 'bg-blue-500';
  };

  const getStatusText = (status: string, conclusion: string | null) => {
    if (status === 'completed') {
      return conclusion || 'completed';
    }
    return status;
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>GitHub Actions</CardTitle>
          <CardDescription>Loading workflow runs...</CardDescription>
        </CardHeader>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>GitHub Actions</CardTitle>
          <CardDescription>Error loading workflows</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-red-500">{error}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>GitHub Actions</CardTitle>
        <CardDescription>
          Recent workflow runs for {owner}/{repo}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {workflows.length === 0 ? (
            <p className="text-sm text-gray-500">No workflow runs found</p>
          ) : (
            workflows.slice(0, 10).map((workflow) => (
              <a
                key={workflow.id}
                href={workflow.html_url}
                target="_blank"
                rel="noopener noreferrer"
                className="block p-4 rounded-lg border hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium truncate">{workflow.name}</p>
                      <Badge
                        className={`${getStatusColor(workflow.status, workflow.conclusion)} text-white`}
                      >
                        {getStatusText(workflow.status, workflow.conclusion)}
                      </Badge>
                    </div>
                    <p className="text-xs text-gray-500 mt-1">
                      {workflow.head_branch} • {workflow.event} •{' '}
                      {new Date(workflow.created_at).toLocaleString()}
                    </p>
                  </div>
                </div>
              </a>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}

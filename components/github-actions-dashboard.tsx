'use client';

import { useState } from 'react';
import { GitHubActionsWidget } from './github-actions-widget';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

interface Repository {
  owner: string;
  repo: string;
  id: string;
}

export function GitHubActionsDashboard() {
  const [repositories, setRepositories] = useState<Repository[]>([
    { owner: 'PittampalliOrg', repo: 'backstage-app', id: '1' },
  ]);
  const [newOwner, setNewOwner] = useState('');
  const [newRepo, setNewRepo] = useState('');

  const addRepository = () => {
    if (newOwner && newRepo) {
      const newId = Date.now().toString();
      setRepositories([
        ...repositories,
        { owner: newOwner, repo: newRepo, id: newId },
      ]);
      setNewOwner('');
      setNewRepo('');
    }
  };

  const removeRepository = (id: string) => {
    setRepositories(repositories.filter((repo) => repo.id !== id));
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Add Repository</CardTitle>
          <CardDescription>
            Monitor GitHub Actions for any public or accessible repository
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <Input
              placeholder="Owner (e.g., facebook)"
              value={newOwner}
              onChange={(e) => setNewOwner(e.target.value)}
              className="flex-1"
            />
            <Input
              placeholder="Repository (e.g., react)"
              value={newRepo}
              onChange={(e) => setNewRepo(e.target.value)}
              className="flex-1"
            />
            <Button onClick={addRepository} disabled={!newOwner || !newRepo}>
              Add
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-6">
        {repositories.map((repo) => (
          <div key={repo.id} className="relative">
            {repositories.length > 1 && (
              <Button
                variant="outline"
                size="sm"
                className="absolute top-4 right-4 z-10"
                onClick={() => removeRepository(repo.id)}
              >
                Remove
              </Button>
            )}
            <GitHubActionsWidget owner={repo.owner} repo={repo.repo} />
          </div>
        ))}
      </div>
    </div>
  );
}
